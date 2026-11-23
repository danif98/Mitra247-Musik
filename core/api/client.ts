/**
 * Client for the YouTube to MP3 service (token in the Authorization header).
 * `fetch` is injectable so the logic is unit-tested without a network.
 */

export type ApiErrorCode =
  | 'no_server' // URL or token not configured in the app
  | 'network' // fetch failed: offline, wrong address, CORS or TLS problem
  | 'unauthorized' // 401: wrong or missing token
  | 'locked_out' // 429 after repeated wrong tokens
  | 'rate_limited' // 429
  | 'busy' // 429: queue full
  | 'invalid_url' // 400
  | 'not_configured' // 503: server has no (valid) token
  | 'not_found' // 404 / expired
  | 'job_failed' // job finished with an error (see jobError)
  | 'timeout' // gave up waiting
  | 'server'; // anything else

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details: {
      status?: number;
      retryAfterSec?: number;
      reason?: string;
      /** Error code reported by a failed job (unavailable, blocked, too_long, ...). */
      jobError?: string;
      serverMessage?: string;
    } = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface Health {
  status: string;
  version: string;
  commit: string | null;
  node: string;
  ytdlp: string | null;
  configured: boolean;
}

export interface JobView {
  id: string;
  videoId: string;
  status: 'queued' | 'running' | 'done' | 'error';
  stage: 'download' | 'convert' | null;
  title: string | null;
  duration: number | null;
  size: number | null;
  error: { code: string; message: string } | null;
  downloadUrl: string | null;
}

export interface YoutubeSearchResult {
  videoId: string;
  title: string;
  channel: string | null;
  /** Seconds. */
  duration: number;
  thumbnail: string;
}

/** "https://host/path/" -> "https://host/path"; null when it is not an http(s) URL. */
export function normalizeBaseUrl(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  try {
    const u = new URL(text);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.username || u.password) return null;
    return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

/** First YouTube link found in shared text (Share Target puts the link in `text` or `url`). */
export function extractYoutubeUrl(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) {
    for (const m of (c ?? '').matchAll(/https?:\/\/[^\s<>"']+/gi)) {
      try {
        const host = new URL(m[0]).hostname.toLowerCase().replace(/\.$/, '');
        if (/^(www\.|m\.|music\.)?youtube\.com$|^youtu\.be$/.test(host)) return m[0];
      } catch {
        /* keep looking */
      }
    }
  }
  return null;
}

/** The 11-character video id of a single-video YouTube URL, or null (playlists/channels are not videos). */
export function parseYoutubeVideoId(input: string): string | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  const ID = /^[A-Za-z0-9_-]{11}$/;
  if (host === 'youtu.be') {
    const id = u.pathname.split('/')[1] ?? '';
    return ID.test(id) ? id : null;
  }
  if (!/^(www\.|m\.|music\.)?youtube\.com$/.test(host)) return null;
  const v = u.searchParams.get('v');
  if (u.pathname === '/watch' && v && ID.test(v)) return v;
  const m = /^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})(?:[/?]|$)/.exec(u.pathname);
  return m ? m[1]! : null;
}

/** Link that opens the PWA on its YouTube screen with the video URL prefilled (used by the extension). */
export function buildAppLink(appUrl: string, videoUrl: string): string | null {
  const base = normalizeBaseUrl(appUrl);
  if (!base || !extractYoutubeUrl(videoUrl)) return null;
  return `${base}/?url=${encodeURIComponent(videoUrl)}`;
}

export interface ClientOptions {
  baseUrl: string;
  token: string;
  fetch?: typeof fetch;
  /** Per-request timeout. */
  timeoutMs?: number;
}

const ZERO_ID = '0'.repeat(32);

export class ApiClient {
  private readonly base: string;
  private readonly token: string;
  private readonly f: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: ClientOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, '');
    this.token = opts.token;
    this.f = opts.fetch ?? ((...a) => fetch(...a));
    this.timeoutMs = opts.timeoutMs ?? 20_000;
  }

  get configured(): boolean {
    return this.base !== '' && this.token !== '';
  }

  async health(): Promise<Health> {
    return (await this.request('/api/health', { auth: false })) as Health;
  }

  /** Verifies the token without side effects: an unknown job id gives 404 when the token is valid. */
  async checkAuth(): Promise<void> {
    try {
      await this.request(`/api/jobs/${ZERO_ID}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'not_found') return;
      throw err;
    }
  }

  /** Search YouTube through the server (metadata only; nothing is downloaded). */
  async search(query: string): Promise<YoutubeSearchResult[]> {
    const body = (await this.request(`/api/search?q=${encodeURIComponent(query)}`)) as {
      results?: YoutubeSearchResult[];
    };
    return Array.isArray(body.results) ? body.results : [];
  }

  async createJob(url: string): Promise<JobView> {
    return (await this.request('/api/jobs', { method: 'POST', body: { url } })) as JobView;
  }

  async getJob(id: string): Promise<JobView> {
    return (await this.request(`/api/jobs/${id}`)) as JobView;
  }

  /** Poll until the job is done (resolves) or failed (throws ApiError 'job_failed'). */
  async waitForJob(
    id: string,
    onUpdate: (job: JobView) => void,
    opts: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<JobView> {
    const interval = opts.intervalMs ?? 1500;
    const deadline = Date.now() + (opts.timeoutMs ?? 10 * 60_000);
    for (;;) {
      if (opts.signal?.aborted) throw new ApiError('timeout', 'aborted');
      const job = await this.getJob(id);
      onUpdate(job);
      if (job.status === 'done') return job;
      if (job.status === 'error') {
        throw new ApiError('job_failed', job.error?.message ?? 'job failed', {
          jobError: job.error?.code,
          serverMessage: job.error?.message,
        });
      }
      if (Date.now() > deadline) throw new ApiError('timeout', 'timeout');
      await new Promise((r) => setTimeout(r, interval));
    }
  }

  /** Download the MP3 through the short-lived link returned by getJob(). */
  async download(downloadUrl: string): Promise<Blob> {
    const res = await this.fetchRaw(
      downloadUrl.startsWith('http') ? downloadUrl : this.base + downloadUrl,
      {},
    );
    if (!res.ok) throw await this.toError(res);
    return res.blob();
  }

  // --- internals ---------------------------------------------------------------------------

  private async request(
    path: string,
    opts: { method?: string; body?: unknown; auth?: boolean } = {},
  ): Promise<unknown> {
    if (!this.configured && opts.auth !== false) throw new ApiError('no_server', 'no server');
    if (this.base === '') throw new ApiError('no_server', 'no server');
    const headers: Record<string, string> = {};
    if (opts.auth !== false) headers['authorization'] = `Bearer ${this.token}`;
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    const res = await this.fetchRaw(this.base + path, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    if (!res.ok) throw await this.toError(res);
    return res.json();
  }

  private async fetchRaw(url: string, init: RequestInit): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      return await this.f(url, { ...init, signal: ctrl.signal });
    } catch {
      throw new ApiError('network', 'network error');
    } finally {
      clearTimeout(timer);
    }
  }

  private async toError(res: Response): Promise<ApiError> {
    let body: { error?: string; message?: string; reason?: string } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      /* non-JSON error page (proxy) */
    }
    const retryAfterSec = Number(res.headers.get('retry-after')) || undefined;
    const details = {
      status: res.status,
      retryAfterSec,
      reason: body.reason,
      serverMessage: body.message,
    };
    if (res.status === 401) return new ApiError('unauthorized', 'unauthorized', details);
    if (res.status === 404) return new ApiError('not_found', 'not found', details);
    if (res.status === 400 && body.error === 'invalid_url')
      return new ApiError('invalid_url', 'invalid url', details);
    if (res.status === 503 && body.error === 'server_not_configured')
      return new ApiError('not_configured', 'not configured', details);
    if (res.status === 429) {
      if (body.error === 'busy') return new ApiError('busy', 'busy', details);
      if (/token/i.test(body.message ?? ''))
        return new ApiError('locked_out', 'locked out', details);
      return new ApiError('rate_limited', 'rate limited', details);
    }
    return new ApiError('server', `server error ${res.status}`, details);
  }
}
