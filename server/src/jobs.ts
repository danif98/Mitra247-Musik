/**
 * Conversion jobs: in-memory records, a small FIFO queue (1-2 active), yt-dlp via spawn with an
 * argument array, and retention cleanup of the produced files.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Clock } from './limits';
import { canonicalUrl } from './youtube-url';

export type JobStatus = 'queued' | 'running' | 'done' | 'error';
export type JobStage = 'download' | 'convert';

export type JobErrorCode =
  | 'unavailable' // private, age/member restricted, removed
  | 'blocked' // YouTube bot check / rate limit
  | 'too_long'
  | 'timeout'
  | 'server_misconfigured'
  | 'failed';

export interface Job {
  id: string;
  videoId: string;
  status: JobStatus;
  stage: JobStage | null;
  title: string | null;
  duration: number | null;
  size: number | null;
  error: { code: JobErrorCode; message: string } | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface JobsOptions {
  dataDir: string;
  ytdlpPath: string | undefined;
  /** Arguments placed before the yt-dlp ones (tests run a fake script through node). */
  ytdlpPrefixArgs?: string[];
  ffmpegPath: string | undefined;
  jsRuntime: string | undefined;
  /** Already validated proxy URL (see isValidProxy). */
  proxy?: string | undefined;
  /** Cookies file to read; a per-job copy is passed to yt-dlp and deleted afterwards. */
  cookiesFile?: string | undefined;
  maxActive: number;
  maxQueue: number;
  maxDurationSec: number;
  retentionMs: number;
  jobTimeoutMs: number;
  now?: Clock;
  /** Optional logger; never receives tokens or full URLs. */
  log?: (message: string) => void;
  /** Failure details (last yt-dlp output lines, URLs removed); goes to stderr. */
  logError?: (message: string) => void;
}

export const JOB_ID = /^[0-9a-f]{32}$/;

/** Fixed argument vector; user input only enters as the canonical URL after `--`. */
export function buildYtdlpArgs(
  o: Pick<JobsOptions, 'dataDir' | 'ffmpegPath' | 'jsRuntime' | 'maxDurationSec' | 'proxy'>,
  jobDir: string,
  videoId: string,
  cookiesCopy?: string,
): string[] {
  return [
    '--ignore-config',
    '--no-playlist',
    '--no-warnings',
    '--newline',
    '--restrict-filenames',
    '--no-mtime',
    '--cache-dir',
    path.join(o.dataDir, 'cache'),
    '-f',
    'ba',
    '-x',
    '--audio-format',
    'mp3',
    '--audio-quality',
    '2',
    '--match-filters',
    `duration<=${o.maxDurationSec}`,
    '--max-filesize',
    '100M',
    '--write-info-json',
    '-o',
    path.join(jobDir, '%(id)s.%(ext)s'),
    ...(o.ffmpegPath ? ['--ffmpeg-location', o.ffmpegPath] : []),
    ...(o.jsRuntime ? ['--js-runtimes', o.jsRuntime] : []),
    ...(o.proxy ? ['--proxy', o.proxy] : []),
    ...(cookiesCopy ? ['--cookies', cookiesCopy] : []),
    '--',
    canonicalUrl(videoId),
  ];
}

/** Environment for the child process: no secrets (MUSIK_TOKEN is never passed on). */
function childEnv(): NodeJS.ProcessEnv {
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

/** Last lines of yt-dlp output for the server log. URLs and the work dir are removed; max 10 lines. */
export function failureLog(jobId: string, code: string, output: string): string {
  const lines = output
    .split(/\r?\n/)
    .map((l) =>
      l
        .replace(/https?:\/\/\S+/gi, '<url>')
        .replace(/[A-Za-z]:\\[^\s"']+|\/(?:home|tmp|var)\/[^\s"']+/g, '<path>')
        .trim()
        .slice(0, 300),
    )
    .filter(Boolean)
    .slice(-10);
  return `job ${jobId.slice(0, 8)} failed (${code}); yt-dlp output:\n  ${lines.join('\n  ')}`;
}

export function classifyFailure(output: string): { code: JobErrorCode; message: string } {
  const text = output.slice(-4000);
  if (/does not pass filter/i.test(text)) {
    return { code: 'too_long', message: 'Video terlalu panjang.' };
  }
  if (
    /sign in to confirm you.re not a bot|not a bot|HTTP Error 429|too many requests/i.test(text)
  ) {
    return { code: 'blocked', message: 'YouTube memblokir permintaan dari server.' };
  }
  if (
    /private video|members-only|age-restricted|confirm your age|video unavailable|removed|not available|copyright|live event|premieres/i.test(
      text,
    )
  ) {
    return { code: 'unavailable', message: 'Video tidak bisa diunduh.' };
  }
  return { code: 'failed', message: 'Konversi gagal.' };
}

function cleanTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let out = '';
  for (const ch of value) {
    const c = ch.codePointAt(0)!;
    out += c < 0x20 || c === 0x7f ? ' ' : ch;
  }
  const t = out.split(/\s+/).filter(Boolean).join(' ');
  return t ? t.slice(0, 200) : null;
}

export class JobManager {
  private readonly jobs = new Map<string, Job>();
  private readonly queue: string[] = [];
  private active = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly now: Clock;
  private readonly jobsDir: string;
  private stopped = false;

  constructor(private readonly o: JobsOptions) {
    this.now = o.now ?? Date.now;
    this.jobsDir = path.join(o.dataDir, 'jobs');
  }

  /** Create folders, remove expired leftovers, and start the periodic sweep. */
  start(sweepEveryMs = 5 * 60_000): void {
    fs.mkdirSync(this.jobsDir, { recursive: true });
    this.sweep();
    this.timer = setInterval(() => this.sweep(), sweepEveryMs);
    this.timer.unref?.();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  counts(): { active: number; queued: number } {
    return { active: this.active, queued: this.queue.length };
  }

  submit(videoId: string): { ok: true; job: Job } | { ok: false; reason: 'busy' } {
    if (this.active + this.queue.length >= this.o.maxActive + this.o.maxQueue) {
      return { ok: false, reason: 'busy' };
    }
    const job: Job = {
      id: randomBytes(16).toString('hex'),
      videoId,
      status: 'queued',
      stage: null,
      title: null,
      duration: null,
      size: null,
      error: null,
      createdAt: this.now(),
      startedAt: null,
      finishedAt: null,
    };
    this.jobs.set(job.id, job);
    this.queue.push(job.id);
    this.pump();
    return { ok: true, job };
  }

  get(id: string): Job | undefined {
    return JOB_ID.test(id) ? this.jobs.get(id) : undefined;
  }

  /** Path of the finished MP3, or null when the job is not done / the file is gone. */
  filePath(job: Job): string | null {
    if (job.status !== 'done') return null;
    const file = path.join(this.jobsDir, job.id, `${job.videoId}.mp3`);
    return fs.existsSync(file) ? file : null;
  }

  /** Delete jobs (records and files) older than the retention period. */
  sweep(): void {
    const t = this.now();
    for (const [id, job] of this.jobs) {
      if (job.finishedAt !== null && job.finishedAt + this.o.retentionMs <= t) {
        this.removeJobDir(id);
        this.jobs.delete(id);
      }
    }
    // Leftovers from before a restart (no in-memory record): judge by folder age.
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(this.jobsDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (this.jobs.has(e.name)) continue;
      const full = path.join(this.jobsDir, e.name);
      try {
        if (fs.statSync(full).mtimeMs + this.o.retentionMs <= t) {
          fs.rmSync(full, { recursive: true, force: true });
        }
      } catch {
        /* ignore races */
      }
    }
  }

  private removeJobDir(id: string): void {
    fs.rmSync(path.join(this.jobsDir, id), { recursive: true, force: true });
  }

  private pump(): void {
    while (!this.stopped && this.active < this.o.maxActive && this.queue.length > 0) {
      const id = this.queue.shift()!;
      const job = this.jobs.get(id);
      if (!job) continue;
      this.active++;
      void this.run(job).finally(() => {
        this.active--;
        this.pump();
      });
    }
  }

  private finish(job: Job, error: Job['error']): void {
    job.error = error;
    job.status = error ? 'error' : 'done';
    job.finishedAt = this.now();
    job.stage = null;
    if (error) {
      // Keep nothing for failed jobs.
      this.removeJobDir(job.id);
    }
    this.o.log?.(`job ${job.id.slice(0, 8)} ${job.status}${error ? ` (${error.code})` : ''}`);
  }

  private run(job: Job): Promise<void> {
    job.status = 'running';
    job.stage = 'download';
    job.startedAt = this.now();
    return new Promise((resolve) => {
      if (!this.o.ytdlpPath) {
        this.finish(job, {
          code: 'server_misconfigured',
          message: 'yt-dlp belum dikonfigurasi di server.',
        });
        resolve();
        return;
      }
      const jobDir = path.join(this.jobsDir, job.id);
      fs.mkdirSync(jobDir, { recursive: true });
      // yt-dlp rewrites the cookie file when it exits, so it gets a private copy that is removed
      // as soon as the process ends.
      let cookiesCopy: string | undefined;
      if (this.o.cookiesFile) {
        try {
          cookiesCopy = path.join(jobDir, 'cookies.txt');
          fs.copyFileSync(this.o.cookiesFile, cookiesCopy);
          fs.chmodSync(cookiesCopy, 0o600);
        } catch {
          cookiesCopy = undefined;
          this.o.logError?.('YTDLP_COOKIES_FILE cannot be read; running without cookies.');
        }
      }
      const args = [
        ...(this.o.ytdlpPrefixArgs ?? []),
        ...buildYtdlpArgs(this.o, jobDir, job.videoId, cookiesCopy),
      ];
      let output = '';
      let settled = false;
      const done = (error: Job['error']) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (cookiesCopy) fs.rmSync(cookiesCopy, { force: true });
        if (!error) {
          const file = path.join(jobDir, `${job.videoId}.mp3`);
          try {
            job.size = fs.statSync(file).size;
          } catch {
            error = /does not pass filter/i.test(output)
              ? { code: 'too_long', message: 'Video terlalu panjang.' }
              : { code: 'failed', message: 'Konversi gagal (tidak ada berkas keluaran).' };
          }
          if (!error) this.readInfo(job, jobDir);
        }
        if (error && output) this.o.logError?.(failureLog(job.id, error.code, output));
        this.finish(job, error);
        resolve();
      };
      const child = spawn(this.o.ytdlpPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        env: childEnv(),
        cwd: this.o.dataDir,
      });
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        done({ code: 'timeout', message: 'Konversi terlalu lama dan dihentikan.' });
      }, this.o.jobTimeoutMs);
      const onData = (chunk: Buffer) => {
        const text = chunk.toString();
        output = (output + text).slice(-8000);
        if (/\[ExtractAudio\]|\[ffmpeg\]/.test(text)) job.stage = 'convert';
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      child.on('error', (err: NodeJS.ErrnoException) => {
        done(
          err.code === 'ENOENT' || err.code === 'EACCES'
            ? { code: 'server_misconfigured', message: 'yt-dlp tidak bisa dijalankan di server.' }
            : { code: 'failed', message: 'Konversi gagal.' },
        );
      });
      child.on('close', (code) => {
        done(code === 0 ? null : classifyFailure(output));
      });
    });
  }

  private readInfo(job: Job, jobDir: string): void {
    try {
      const info = JSON.parse(
        fs.readFileSync(path.join(jobDir, `${job.videoId}.info.json`), 'utf8'),
      ) as { title?: unknown; duration?: unknown };
      job.title = cleanTitle(info.title);
      job.duration = typeof info.duration === 'number' ? info.duration : null;
    } catch {
      /* optional */
    }
  }
}
