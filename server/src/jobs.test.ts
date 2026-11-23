import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { JobManager, buildYtdlpArgs, failureLog, type Job, type JobsOptions } from './jobs';
import { FAKE_YTDLP, removeDir, tempDir, until } from '../test/helpers';

const dirs: string[] = [];
const managers: JobManager[] = [];
afterEach(async () => {
  const ms = managers.splice(0);
  await until(() => ms.every((m) => m.counts().active === 0), 5000).catch(() => undefined);
  ms.forEach((m) => m.stop());
  dirs.splice(0).forEach(removeDir);
});

function make(over: Partial<JobsOptions> = {}, clock?: { now: () => number }) {
  const dataDir = tempDir();
  dirs.push(dataDir);
  const m = new JobManager({
    dataDir,
    ytdlpPath: process.execPath,
    ytdlpPrefixArgs: [FAKE_YTDLP],
    ffmpegPath: '/opt/ffmpeg',
    jsRuntime: 'node:/opt/node',
    maxActive: 1,
    maxQueue: 2,
    maxDurationSec: 1200,
    retentionMs: 3_600_000,
    jobTimeoutMs: 5000,
    ...clock,
    ...over,
  });
  managers.push(m);
  return { m, dataDir };
}

const finished = (job: Job) => job.status === 'done' || job.status === 'error';
const vid = (prefix: string) => (prefix + 'xxxxxxxxxxx').slice(0, 11);

describe('buildYtdlpArgs', () => {
  it('is a fixed vector with the canonical URL last after --', () => {
    const args = buildYtdlpArgs(
      { dataDir: '/d', ffmpegPath: '/f/ffmpeg', jsRuntime: 'node:/n', maxDurationSec: 900 },
      '/d/jobs/abc',
      'dQw4w9WgXcQ',
    );
    expect(args.slice(-2)).toEqual(['--', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ']);
    expect(args).toEqual(expect.arrayContaining(['--no-playlist', '--ignore-config', '-x']));
    const at = (flag: string) => args[args.indexOf(flag) + 1];
    expect(at('-f')).toBe('ba');
    expect(at('--audio-format')).toBe('mp3');
    expect(at('--audio-quality')).toBe('2');
    expect(at('--ffmpeg-location')).toBe('/f/ffmpeg');
    expect(at('--js-runtimes')).toBe('node:/n');
    expect(at('--match-filters')).toBe('duration<=900');
    expect(args.every((a) => typeof a === 'string')).toBe(true);
  });
  it('adds --proxy and --cookies only when given', () => {
    const base = { dataDir: '/d', ffmpegPath: undefined, jsRuntime: undefined, maxDurationSec: 60 };
    const withBoth = buildYtdlpArgs(
      { ...base, proxy: 'socks5h://u:p@10.0.0.1:1080' },
      '/d/jobs/abc',
      'dQw4w9WgXcQ',
      '/d/jobs/abc/cookies.txt',
    );
    const at = (flag: string) => withBoth[withBoth.indexOf(flag) + 1];
    expect(at('--proxy')).toBe('socks5h://u:p@10.0.0.1:1080');
    expect(at('--cookies')).toBe('/d/jobs/abc/cookies.txt');
    expect(withBoth.slice(-2)[0]).toBe('--');
    const none = buildYtdlpArgs(base, '/d/jobs/abc', 'dQw4w9WgXcQ');
    expect(none).not.toContain('--proxy');
    expect(none).not.toContain('--cookies');
  });
  it('omits optional flags when not configured', () => {
    const args = buildYtdlpArgs(
      { dataDir: '/d', ffmpegPath: undefined, jsRuntime: undefined, maxDurationSec: 60 },
      '/d/jobs/abc',
      'dQw4w9WgXcQ',
    );
    expect(args).not.toContain('--ffmpeg-location');
    expect(args).not.toContain('--js-runtimes');
  });
});

describe('JobManager', () => {
  it('runs a job to completion and records title, size and stages', async () => {
    const { m, dataDir } = make();
    const r = m.submit(vid('OKAY'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    await until(() => finished(r.job));
    expect(r.job.status).toBe('done');
    expect(r.job.title).toBe(`Judul Uji ${vid('OKAY')}`);
    expect(r.job.size).toBeGreaterThan(1000);
    const file = m.filePath(r.job)!;
    expect(file.startsWith(path.join(dataDir, 'jobs'))).toBe(true);
    expect(fs.existsSync(file)).toBe(true);
  });

  it('passes no secrets and the exact arguments to the child process', async () => {
    process.env['MUSIK_TOKEN'] = 'super-secret-token-value-123456789012345';
    try {
      const { m, dataDir } = make();
      const r = m.submit(vid('ARGS'));
      if (!r.ok) throw new Error('rejected');
      await until(() => finished(r.job));
      const argv = JSON.parse(
        fs.readFileSync(path.join(dataDir, 'jobs', r.job.id, 'argv.json'), 'utf8'),
      ) as { args: string[]; env: string[] };
      expect(argv.args.slice(-2)).toEqual(['--', `https://www.youtube.com/watch?v=${vid('ARGS')}`]);
      expect(argv.args).toContain('--no-playlist');
      expect(argv.env).not.toContain('MUSIK_TOKEN');
      expect(JSON.stringify(argv)).not.toContain('super-secret');
    } finally {
      delete process.env['MUSIK_TOKEN'];
    }
  });

  it('gives yt-dlp a private copy of the cookies file and removes it afterwards', async () => {
    const dir = tempDir();
    dirs.push(dir);
    const cookies = path.join(dir, 'cookies.txt');
    fs.writeFileSync(cookies, '# Netscape HTTP Cookie File\n');
    const { m, dataDir } = make({ cookiesFile: cookies, proxy: 'http://127.0.0.1:3128' });
    const r = m.submit(vid('COOK'));
    if (!r.ok) throw new Error('rejected');
    await until(() => finished(r.job));
    const jobDir = path.join(dataDir, 'jobs', r.job.id);
    const argv = JSON.parse(fs.readFileSync(path.join(jobDir, 'argv.json'), 'utf8')) as {
      args: string[];
    };
    const copy = argv.args[argv.args.indexOf('--cookies') + 1];
    expect(copy).toBe(path.join(jobDir, 'cookies.txt'));
    expect(copy).not.toBe(cookies);
    expect(argv.args[argv.args.indexOf('--proxy') + 1]).toBe('http://127.0.0.1:3128');
    expect(fs.existsSync(copy!)).toBe(false);
    expect(fs.existsSync(cookies)).toBe(true);
  });

  it('maps failures to clear error codes and removes their files', async () => {
    const { m, dataDir } = make({ maxActive: 2, maxQueue: 5 });
    const cases: [string, string][] = [
      ['FAIL', 'unavailable'],
      ['BOTX', 'blocked'],
      ['LONG', 'too_long'],
      ['NOFL', 'failed'],
    ];
    const jobs = cases.map(([p]) => {
      const r = m.submit(vid(p));
      if (!r.ok) throw new Error('rejected');
      return r.job;
    });
    await until(() => jobs.every(finished));
    cases.forEach(([, code], i) => {
      expect(jobs[i]!.status).toBe('error');
      expect(jobs[i]!.error?.code).toBe(code);
      expect(fs.existsSync(path.join(dataDir, 'jobs', jobs[i]!.id))).toBe(false);
    });
  });

  it('reports a missing yt-dlp binary as server_misconfigured', async () => {
    const { m } = make({ ytdlpPath: path.join(tempDir(), 'does-not-exist'), ytdlpPrefixArgs: [] });
    const r = m.submit(vid('OKAY'));
    if (!r.ok) throw new Error('rejected');
    await until(() => finished(r.job));
    expect(r.job.error?.code).toBe('server_misconfigured');
    const { m: m2 } = make({ ytdlpPath: undefined });
    const r2 = m2.submit(vid('OKAY'));
    if (!r2.ok) throw new Error('rejected');
    await until(() => finished(r2.job));
    expect(r2.job.error?.code).toBe('server_misconfigured');
  });

  it('kills a hanging conversion after the timeout', async () => {
    const { m } = make({ jobTimeoutMs: 400 });
    const r = m.submit(vid('HANG'));
    if (!r.ok) throw new Error('rejected');
    await until(() => finished(r.job));
    expect(r.job.error?.code).toBe('timeout');
  });

  it('limits concurrency, queues the rest and rejects when full', async () => {
    const { m } = make({ maxActive: 1, maxQueue: 1 });
    const a = m.submit(vid('SLOW1'));
    const b = m.submit(vid('SLOW2'));
    const c = m.submit(vid('SLOW3'));
    expect(a.ok && b.ok).toBe(true);
    expect(c).toEqual({ ok: false, reason: 'busy' });
    expect(m.counts()).toEqual({ active: 1, queued: 1 });
    if (!a.ok || !b.ok) return;
    expect(a.job.status).toBe('running');
    expect(b.job.status).toBe('queued');
    await until(() => finished(a.job));
    expect(finished(b.job) || b.job.status === 'running').toBe(true);
    await until(() => finished(b.job));
    expect(b.job.status).toBe('done');
    expect(m.counts()).toEqual({ active: 0, queued: 0 });
    // capacity is free again
    expect(m.submit(vid('OKAY')).ok).toBe(true);
  });

  it('runs two conversions at the same time when maxActive is 2', async () => {
    const { m } = make({ maxActive: 2, maxQueue: 0 });
    const a = m.submit(vid('SLOW1'));
    const b = m.submit(vid('SLOW2'));
    if (!a.ok || !b.ok) throw new Error('rejected');
    expect(m.counts().active).toBe(2);
    expect(m.submit(vid('SLOW3')).ok).toBe(false);
    await until(() => finished(a.job) && finished(b.job));
    expect([a.job.status, b.job.status]).toEqual(['done', 'done']);
  });

  it('deletes finished jobs and files after the retention period (fake clock)', async () => {
    let t = 1_000_000;
    const { m, dataDir } = make({}, { now: () => t });
    const r = m.submit(vid('OKAY'));
    if (!r.ok) throw new Error('rejected');
    await until(() => finished(r.job));
    const file = m.filePath(r.job)!;
    t += 3_599_000;
    m.sweep();
    expect(fs.existsSync(file)).toBe(true);
    expect(m.get(r.job.id)).toBeDefined();
    t += 2_000; // now past 1 hour after it finished
    m.sweep();
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.existsSync(path.join(dataDir, 'jobs', r.job.id))).toBe(false);
    expect(m.get(r.job.id)).toBeUndefined();
  });

  it('cleans expired leftovers at start and keeps recent ones', () => {
    const now = Date.now();
    const { m, dataDir } = make({}, { now: () => now });
    const jobsDir = path.join(dataDir, 'jobs');
    const old = path.join(jobsDir, 'a'.repeat(32));
    const fresh = path.join(jobsDir, 'b'.repeat(32));
    for (const d of [old, fresh]) {
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'x.mp3'), 'x');
    }
    const twoHoursAgo = new Date(now - 2 * 3_600_000);
    fs.utimesSync(old, twoHoursAgo, twoHoursAgo);
    m.start(60 * 60_000);
    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
  });

  it('only exposes jobs by well-formed ids', () => {
    const { m } = make();
    expect(m.get('../../etc/passwd')).toBeUndefined();
    expect(m.get('z'.repeat(32))).toBeUndefined();
  });
});

describe('failureLog', () => {
  it('keeps the last 10 lines, removes URLs and paths', () => {
    const out = [
      ...Array.from({ length: 20 }, (_, i) => `line ${i}`),
      'ERROR: [youtube] abc: Sign in to confirm you are not a bot. See https://github.com/yt-dlp/yt-dlp/wiki/FAQ',
      'cannot write /home/user/data/jobs/x/file.part',
    ].join('\n');
    const msg = failureLog('0123456789abcdef', 'blocked', out);
    expect(msg).toContain('job 01234567 failed (blocked)');
    expect(msg).toContain('Sign in to confirm');
    expect(msg).toContain('<url>');
    expect(msg).toContain('<path>');
    expect(msg).not.toContain('github.com');
    expect(msg).not.toContain('/home/user');
    expect(msg).not.toContain('line 5');
    expect(msg.split('\n').length).toBe(11);
  });
});
