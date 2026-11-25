/**
 * YouTube search through yt-dlp (`ytsearchN:<query>` with --flat-playlist): one metadata request,
 * nothing is downloaded. The query is user input; it is length-limited, stripped of control
 * characters and only ever passed as a single argument after `--` (never through a shell).
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Clock } from './limits';

export const SEARCH_MAX_QUERY = 100;
/** Results asked from yt-dlp per page; the app loads further pages while scrolling. */
export const SEARCH_RESULTS = 15;
/** Deepest result position a client may reach (keeps one search request small). */
export const SEARCH_MAX_OFFSET = 150;

export interface SearchResult {
  videoId: string;
  title: string;
  channel: string | null;
  /** Seconds. */
  duration: number;
  thumbnail: string;
}

/** One page of results; `hasMore` is true while YouTube returned a full page. */
export interface SearchPage {
  results: SearchResult[];
  hasMore: boolean;
}

export type SearchErrorCode = 'blocked' | 'timeout' | 'server_misconfigured' | 'failed';

export class SearchError extends Error {
  constructor(readonly code: SearchErrorCode) {
    super(code);
    this.name = 'SearchError';
  }
}

export interface SearchOptions {
  dataDir: string;
  ytdlpPath: string | undefined;
  /** Arguments placed before the yt-dlp ones (tests run a fake script through node). */
  ytdlpPrefixArgs?: string[];
  jsRuntime: string | undefined;
  proxy?: string | undefined;
  cookiesFile?: string | undefined;
  maxDurationSec: number;
  timeoutMs?: number;
  now?: Clock;
  logError?: (message: string) => void;
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** Trimmed single-line query, or null when empty. */
export function cleanQuery(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const q = input
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return q === '' ? null : q.slice(0, SEARCH_MAX_QUERY);
}

/** Page start from the query string: a whole number within limits, else 0. */
export function cleanOffset(input: unknown): number {
  const n = typeof input === 'string' && /^\d{1,4}$/.test(input) ? Number(input) : 0;
  return Math.min(n, SEARCH_MAX_OFFSET);
}

/**
 * `ytsearchdateN` asks YouTube for the newest uploads first. Pages beyond the first re-run the
 * search for offset+N entries and keep only the last N with --playlist-items.
 */
export function buildSearchArgs(
  o: Pick<SearchOptions, 'dataDir' | 'jsRuntime' | 'proxy'>,
  query: string,
  cookiesCopy?: string,
  offset = 0,
): string[] {
  return [
    '--ignore-config',
    '--flat-playlist',
    ...(offset > 0 ? ['--playlist-items', `${offset + 1}-${offset + SEARCH_RESULTS}`] : []),
    '--dump-json',
    '--no-warnings',
    '--cache-dir',
    path.join(o.dataDir, 'cache'),
    ...(o.jsRuntime ? ['--js-runtimes', o.jsRuntime] : []),
    ...(o.proxy ? ['--proxy', o.proxy] : []),
    ...(cookiesCopy ? ['--cookies', cookiesCopy] : []),
    '--',
    `ytsearchdate${offset + SEARCH_RESULTS}:${query}`,
  ];
}

/** Maps yt-dlp JSON lines to results. Drops live/unknown length, over-limit and malformed entries. */
export function parseSearchOutput(output: string, maxDurationSec: number): SearchResult[] {
  return parseSearchPage(output, maxDurationSec).results;
}

/** Like parseSearchOutput, plus how many entries yt-dlp returned before filtering. */
export function parseSearchPage(
  output: string,
  maxDurationSec: number,
): { results: SearchResult[]; raw: number } {
  const results: SearchResult[] = [];
  let raw = 0;
  const seen = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    if (!line.startsWith('{')) continue;
    let e: Record<string, unknown>;
    try {
      e = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const videoId = typeof e['id'] === 'string' ? e['id'] : '';
    const title = typeof e['title'] === 'string' ? e['title'].trim() : '';
    const duration = typeof e['duration'] === 'number' ? Math.round(e['duration']) : 0;
    raw++;
    if (!VIDEO_ID.test(videoId) || !title || duration <= 0 || duration > maxDurationSec) continue;
    if (seen.has(videoId)) continue;
    seen.add(videoId);
    const channelRaw = e['channel'] ?? e['uploader'];
    results.push({
      videoId,
      title: title.slice(0, 200),
      channel: typeof channelRaw === 'string' && channelRaw ? channelRaw.slice(0, 100) : null,
      duration,
      // Built from the id, so the server never relays arbitrary URLs from yt-dlp output.
      thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    });
  }
  return { results, raw };
}

function classify(output: string): SearchErrorCode {
  if (/sign in to confirm|not a bot|HTTP Error 429|too many requests/i.test(output))
    return 'blocked';
  return 'failed';
}

/** Small in-memory cache: repeated searches do not hit YouTube again (and cannot be spammed). */
export class SearchCache {
  private readonly map = new Map<string, { at: number; page: SearchPage }>();
  constructor(
    private readonly ttlMs = 5 * 60_000,
    private readonly max = 50,
    private readonly now: Clock = Date.now,
  ) {}
  get(key: string): SearchPage | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (this.now() - hit.at > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    return hit.page;
  }
  set(key: string, page: SearchPage): void {
    if (this.map.size >= this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { at: this.now(), page });
  }
}

export function searchYoutube(o: SearchOptions, query: string, offset = 0): Promise<SearchPage> {
  return new Promise((resolve, reject) => {
    if (!o.ytdlpPath) return reject(new SearchError('server_misconfigured'));
    let cookiesCopy: string | undefined;
    let tmpDir: string | undefined;
    if (o.cookiesFile) {
      try {
        tmpDir = path.join(o.dataDir, `search-${randomBytes(8).toString('hex')}`);
        fs.mkdirSync(tmpDir, { recursive: true });
        cookiesCopy = path.join(tmpDir, 'cookies.txt');
        fs.copyFileSync(o.cookiesFile, cookiesCopy);
        fs.chmodSync(cookiesCopy, 0o600);
      } catch {
        cookiesCopy = undefined;
        o.logError?.('YTDLP_COOKIES_FILE cannot be read; searching without cookies.');
      }
    }
    const cleanup = () => {
      if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    };

    let out = '';
    let err = '';
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      fn();
    };
    const args = [...(o.ytdlpPrefixArgs ?? []), ...buildSearchArgs(o, query, cookiesCopy, offset)];
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(o.ytdlpPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        env: pickEnv(),
      });
    } catch {
      cleanup();
      return reject(new SearchError('server_misconfigured'));
    }
    const timer = setTimeout(() => {
      child.kill();
      finish(() => reject(new SearchError('timeout')));
    }, o.timeoutMs ?? 30_000);
    child.stdout?.on('data', (d: Buffer) => {
      if (out.length < 2_000_000) out += d.toString();
    });
    child.stderr?.on('data', (d: Buffer) => {
      if (err.length < 20_000) err += d.toString();
    });
    child.on('error', (e: NodeJS.ErrnoException) => {
      finish(() =>
        reject(new SearchError(e.code === 'ENOENT' ? 'server_misconfigured' : 'failed')),
      );
    });
    child.on('close', (code) => {
      finish(() => {
        if (code === 0) {
          const { results, raw } = parseSearchPage(out, o.maxDurationSec);
          return resolve({
            results,
            hasMore: raw >= SEARCH_RESULTS && offset + SEARCH_RESULTS < SEARCH_MAX_OFFSET,
          });
        }
        const kind = classify(err);
        o.logError?.(`search failed (exit ${code}, ${kind})`);
        reject(new SearchError(kind));
      });
    });
  });
}

/** Same minimal environment as the conversion jobs: no secrets reach the child. */
function pickEnv(): NodeJS.ProcessEnv {
  const keep = [
    'PATH',
    'Path',
    'HOME',
    'USERPROFILE',
    'SystemRoot',
    'TMPDIR',
    'TEMP',
    'TMP',
    'LANG',
  ];
  const env: NodeJS.ProcessEnv = {};
  for (const k of keep) if (process.env[k] !== undefined) env[k] = process.env[k];
  return env;
}
