import path from 'node:path';

export interface Config {
  port: number;
  /** Shared secret for Bearer auth. Undefined means the server is not configured. */
  token: string | undefined;
  ytdlpPath: string | undefined;
  ffmpegPath: string | undefined;
  dataDir: string;
  /** Origins allowed by CORS (PWA origin, chrome-extension://<id>). Empty = no cross-origin access. */
  allowedOrigins: string[];
  /** Take the client IP from the last X-Forwarded-For entry (set by the cPanel proxy). */
  trustProxy: boolean;
  /** Concurrent conversions (1-2). */
  maxActive: number;
  /** Jobs allowed to wait behind the active ones. */
  maxQueue: number;
  maxDurationSec: number;
  retentionMs: number;
  jobTimeoutMs: number;
  /** Value for yt-dlp --js-runtimes, e.g. "node:/home/user/nodevenv/.../bin/node". */
  jsRuntime: string | undefined;
}

function intIn(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

/** Minimum token length (the PRD asks for >= 32 random bytes; hex/base64 of that is >= 43 chars). */
export const MIN_TOKEN_LENGTH = 32;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env['PORT'] ?? 3000);
  const token = env['MUSIK_TOKEN']?.trim() || undefined;
  return {
    port: Number.isInteger(port) && port >= 0 && port < 65536 ? port : 3000,
    token,
    ytdlpPath: env['YTDLP_PATH']?.trim() || undefined,
    ffmpegPath: env['FFMPEG_PATH']?.trim() || undefined,
    dataDir: path.resolve(env['DATA_DIR']?.trim() || path.join(process.cwd(), 'data')),
    allowedOrigins: (env['ALLOWED_ORIGINS'] ?? '')
      .split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean),
    trustProxy: (env['TRUST_PROXY'] ?? 'true').toLowerCase() !== 'false',
    maxActive: intIn(env['MAX_ACTIVE'], 1, 1, 2),
    maxQueue: intIn(env['MAX_QUEUE'], 3, 0, 10),
    maxDurationSec: intIn(env['MAX_DURATION_SEC'], 20 * 60, 30, 3 * 3600),
    retentionMs: intIn(env['RETENTION_MINUTES'], 60, 1, 24 * 60) * 60_000,
    jobTimeoutMs: intIn(env['JOB_TIMEOUT_SEC'], 300, 10, 1800) * 1000,
    jsRuntime: env['YTDLP_JS_RUNTIME']?.trim() || undefined,
  };
}

/** Human readable configuration problems; empty when the server is fully usable. */
export function configProblems(config: Config): string[] {
  const problems: string[] = [];
  if (!config.token) {
    problems.push('MUSIK_TOKEN is not set. All endpoints except GET /api/health are disabled.');
  } else if (config.token.length < MIN_TOKEN_LENGTH) {
    problems.push(
      `MUSIK_TOKEN is shorter than ${MIN_TOKEN_LENGTH} characters. All endpoints except GET /api/health are disabled.`,
    );
  }
  return problems;
}
