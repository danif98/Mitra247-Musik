import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { hasValidBearer } from './auth';
import { readBuildInfo, type BuildInfo } from './build-info';
import { configProblems, loadConfig, loadDotEnv, type Config } from './config';
import { JOB_ID, JobManager, type Job } from './jobs';
import { AuthLockout, SlidingWindowLimiter, type Clock } from './limits';
import { LINK_TTL_MS, signLink, verifyLink } from './signing';
import { getYtdlpInfo } from './ytdlp';
import { parseYoutubeUrl, type UrlRejection } from './youtube-url';

export interface AppDeps {
  now?: Clock;
  /** Tests only: run a fake yt-dlp script through node. */
  ytdlpPrefixArgs?: string[];
  /** Tests only: start without the periodic timers. */
  quiet?: boolean;
}

export interface App {
  server: http.Server;
  jobs: JobManager;
}

const MAX_BODY = 2048;
const URL_MESSAGES: Record<UrlRejection, string> = {
  invalid: 'URL tidak valid.',
  scheme: 'URL harus diawali http:// atau https://.',
  host: 'Hanya URL youtube.com, youtu.be dan music.youtube.com yang diterima.',
  playlist: 'URL playlist tidak didukung. Gunakan URL satu video.',
  no_video: 'URL tidak mengarah ke satu video YouTube.',
};

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
  extra: http.OutgoingHttpHeaders = {},
): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extra,
  });
  res.end(JSON.stringify(body));
}

/**
 * The app may be mounted under a sub-path (cPanel "Application URL" such as /musik-api); Passenger
 * passes the full original path through. Routes live under /api/, so anything before that is dropped.
 */
export function routePath(pathname: string): string {
  const i = pathname.indexOf('/api/');
  return i > 0 ? pathname.slice(i) : pathname;
}

function clientIp(req: http.IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const xff = req.headers['x-forwarded-for'];
    const last = (Array.isArray(xff) ? xff.join(',') : (xff ?? '')).split(',').pop()?.trim();
    if (last) return last;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const type = String(req.headers['content-type'] ?? '');
    if (!/^application\/json\b/i.test(type)) return reject(new Error('content_type'));
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('too_large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('bad_json'));
      }
    });
    req.on('error', reject);
  });
}

function publicJob(job: Job, fileLink: string | null) {
  return {
    id: job.id,
    videoId: job.videoId,
    status: job.status,
    stage: job.stage,
    title: job.title,
    duration: job.duration,
    size: job.size,
    error: job.error,
    downloadUrl: fileLink,
  };
}

function asciiName(title: string | null, fallback: string): string {
  const base = (title ?? fallback).replace(/[^A-Za-z0-9._ -]+/g, '_').trim() || fallback;
  return `${base.slice(0, 80)}.mp3`;
}

export function createApp(
  config: Config,
  build: BuildInfo = readBuildInfo(),
  deps: AppDeps = {},
): App {
  const now = deps.now ?? Date.now;
  const problems = configProblems(config);
  const configured = problems.length === 0;
  const token = config.token ?? '';

  const jobs = new JobManager({
    dataDir: config.dataDir,
    ytdlpPath: config.ytdlpPath,
    ytdlpPrefixArgs: deps.ytdlpPrefixArgs,
    ffmpegPath: config.ffmpegPath,
    jsRuntime: config.jsRuntime,
    maxActive: config.maxActive,
    maxQueue: config.maxQueue,
    maxDurationSec: config.maxDurationSec,
    retentionMs: config.retentionMs,
    jobTimeoutMs: config.jobTimeoutMs,
    now,
    log: (m) => console.log(`[musik] ${m}`),
  });
  if (configured && !deps.quiet) jobs.start();

  const generalLimiter = new SlidingWindowLimiter(120, 60_000, now);
  const ipJobLimiter = new SlidingWindowLimiter(10, 60_000, now);
  const tokenJobLimiter = new SlidingWindowLimiter(20, 60_000, now);
  const lockout = new AuthLockout(
    { maxFailures: 5, windowMs: 10 * 60_000, blockMs: 15 * 60_000 },
    now,
  );

  function cors(req: http.IncomingMessage): http.OutgoingHttpHeaders {
    const origin = req.headers['origin'];
    if (typeof origin !== 'string' || !config.allowedOrigins.includes(origin)) return {};
    return {
      'access-control-allow-origin': origin,
      vary: 'Origin',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-max-age': '600',
    };
  }

  function tooMany(
    res: http.ServerResponse,
    extra: http.OutgoingHttpHeaders,
    retryMs: number,
    what: string,
  ) {
    sendJson(
      res,
      429,
      { error: 'rate_limited', message: what, retryAfterSec: Math.ceil(retryMs / 1000) },
      { ...extra, 'retry-after': String(Math.max(1, Math.ceil(retryMs / 1000))) },
    );
  }

  const server = http.createServer((req, res) => {
    void handle(req, res).catch(() => {
      if (!res.headersSent) sendJson(res, 500, { error: 'internal', message: 'Galat server.' });
      else res.end();
    });
  });
  server.on('close', () => jobs.stop());

  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const route = routePath(url.pathname);
    const method = req.method ?? 'GET';
    const ip = clientIp(req, config.trustProxy);
    const corsHeaders = cors(req);

    // CORS preflight: answered before auth (it carries no credentials).
    if (method === 'OPTIONS') {
      if (Object.keys(corsHeaders).length === 0) {
        sendJson(res, 403, { error: 'origin_not_allowed', message: 'Origin tidak diizinkan.' });
        return;
      }
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }
    // A browser request from an origin that is not allowed gets no CORS headers (blocked by the
    // browser). Non-browser clients send no Origin header and are not affected.

    const general = generalLimiter.hit(ip);
    if (!general.allowed)
      return tooMany(res, corsHeaders, general.retryAfterMs, 'Terlalu banyak permintaan.');

    // Public: health only.
    if (method === 'GET' && route === '/api/health') {
      const ytdlpInfo = await getYtdlpInfo(config.ytdlpPath);
      sendJson(
        res,
        200,
        {
          status: 'ok',
          version: build.version,
          commit: build.commit,
          builtAt: build.builtAt,
          node: process.version,
          ytdlp: ytdlpInfo.version,
          ytdlpProblem: ytdlpInfo.problem,
          ffmpegFound: config.ffmpegPath ? fs.existsSync(config.ffmpegPath) : null,
          configured,
        },
        corsHeaders,
      );
      return;
    }

    if (!configured) {
      sendJson(
        res,
        503,
        { error: 'server_not_configured', message: problems.join(' ') },
        corsHeaders,
      );
      return;
    }

    // Short-lived signed download link (no Authorization header needed, e.g. for <audio>/<a>).
    const fileMatch = /^\/api\/files\/([0-9a-f]{32})\.mp3$/.exec(route);
    if (method === 'GET' && fileMatch) {
      const id = fileMatch[1]!;
      const signed = verifyLink(
        token,
        id,
        url.searchParams.get('exp'),
        url.searchParams.get('sig'),
        now(),
      );
      if (!signed && !authorize(req, res, ip, corsHeaders)) return;
      serveFile(res, id, corsHeaders);
      return;
    }

    if (!authorize(req, res, ip, corsHeaders)) return;

    if (method === 'POST' && route === '/api/jobs') {
      const lim = ipJobLimiter.hit(ip);
      const limTok = tokenJobLimiter.hit('token');
      if (!lim.allowed || !limTok.allowed) {
        return tooMany(
          res,
          corsHeaders,
          Math.max(lim.retryAfterMs, limTok.retryAfterMs),
          'Terlalu banyak permintaan konversi.',
        );
      }
      let body: unknown;
      try {
        body = await readJsonBody(req);
      } catch (err) {
        const code = err instanceof Error ? err.message : 'bad_json';
        sendJson(
          res,
          code === 'too_large' ? 413 : 400,
          { error: code, message: 'Isi permintaan tidak valid.' },
          corsHeaders,
        );
        return;
      }
      const parsed = parseYoutubeUrl((body as { url?: unknown } | null)?.url);
      if (!parsed.ok) {
        sendJson(
          res,
          400,
          { error: 'invalid_url', reason: parsed.reason, message: URL_MESSAGES[parsed.reason] },
          corsHeaders,
        );
        return;
      }
      const submitted = jobs.submit(parsed.videoId);
      if (!submitted.ok) {
        sendJson(
          res,
          429,
          { error: 'busy', message: 'Server sedang sibuk. Coba lagi sebentar.' },
          { ...corsHeaders, 'retry-after': '15' },
        );
        return;
      }
      sendJson(res, 202, publicJob(submitted.job, null), corsHeaders);
      return;
    }

    const jobMatch = /^\/api\/jobs\/([^/]+)$/.exec(route);
    if (method === 'GET' && jobMatch) {
      const job = JOB_ID.test(jobMatch[1]!) ? jobs.get(jobMatch[1]!) : undefined;
      if (!job) {
        sendJson(
          res,
          404,
          { error: 'not_found', message: 'Tugas tidak ditemukan atau sudah kedaluwarsa.' },
          corsHeaders,
        );
        return;
      }
      let link: string | null = null;
      if (job.status === 'done' && jobs.filePath(job)) {
        const { exp, sig } = signLink(token, job.id, now());
        link = `/api/files/${job.id}.mp3?exp=${exp}&sig=${sig}`;
      }
      sendJson(res, 200, { ...publicJob(job, link), linkTtlSec: LINK_TTL_MS / 1000 }, corsHeaders);
      return;
    }

    sendJson(res, 404, { error: 'not_found', message: 'Endpoint tidak ada.' }, corsHeaders);
  }

  /** Bearer check with lockout. Returns false after writing the error response. */
  function authorize(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    ip: string,
    corsHeaders: http.OutgoingHttpHeaders,
  ): boolean {
    const blocked = lockout.blockedFor(ip);
    if (blocked > 0) {
      tooMany(res, corsHeaders, blocked, 'Terlalu banyak token salah. Coba lagi nanti.');
      return false;
    }
    if (!hasValidBearer(req, token)) {
      lockout.recordFailure(ip);
      sendJson(
        res,
        401,
        { error: 'unauthorized', message: 'Token tidak ada atau salah.' },
        { ...corsHeaders, 'www-authenticate': 'Bearer' },
      );
      return false;
    }
    lockout.recordSuccess(ip);
    return true;
  }

  function serveFile(
    res: http.ServerResponse,
    id: string,
    corsHeaders: http.OutgoingHttpHeaders,
  ): void {
    const job = jobs.get(id);
    const file = job ? jobs.filePath(job) : null;
    if (!job || !file) {
      sendJson(
        res,
        404,
        { error: 'not_found', message: 'Berkas tidak ada atau sudah dihapus.' },
        corsHeaders,
      );
      return;
    }
    const size = fs.statSync(file).size;
    const name = asciiName(job.title, job.videoId);
    res.writeHead(200, {
      ...corsHeaders,
      'content-type': 'audio/mpeg',
      'content-length': size,
      'content-disposition': `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent((job.title ?? job.videoId) + '.mp3')}`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    });
    fs.createReadStream(file).pipe(res);
  }

  const prune = setInterval(() => {
    generalLimiter.prune();
    ipJobLimiter.prune();
    tokenJobLimiter.prune();
  }, 60_000);
  prune.unref?.();
  server.on('close', () => clearInterval(prune));

  return { server, jobs };
}

function main(): void {
  // Local runs: read ./.env if present (existing environment variables win; none on cPanel).
  const loaded = loadDotEnv(path.join(process.cwd(), '.env'));
  if (loaded.length) console.log(`[musik] loaded from .env: ${loaded.join(', ')}`);
  const config = loadConfig();
  for (const p of configProblems(config)) console.warn(`[musik] WARNING: ${p}`);
  const { server } = createApp(config);
  server.listen(config.port, () => {
    // Never log the token.
    console.log(`[musik] listening on ${config.port}`);
  });
}

if (require.main === module) main();
