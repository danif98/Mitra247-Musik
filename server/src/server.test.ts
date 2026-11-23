import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { configProblems, loadConfig, loadDotEnv } from './config';
import { safeEqual } from './auth';
import { TOKEN, auth, json, removeDir, startApp, tempDir, type Started } from '../test/helpers';

let s: Started | undefined;
afterEach(async () => {
  await s?.close();
  s = undefined;
});

const post = (base: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}/api/jobs`, {
    method: 'POST',
    headers: { ...json, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const YT = (id: string) => `https://youtu.be/${(id + 'xxxxxxxxxxx').slice(0, 11)}`;

describe('config', () => {
  it('treats a missing or short token as not configured', () => {
    expect(configProblems(loadConfig({})).join()).toMatch(/not set/);
    expect(configProblems(loadConfig({ MUSIK_TOKEN: 'short' })).join()).toMatch(/shorter than/);
    expect(configProblems(loadConfig({ MUSIK_TOKEN: TOKEN }))).toEqual([]);
  });
  it('parses and clamps options', () => {
    const c = loadConfig({
      ALLOWED_ORIGINS: 'https://a.example/, chrome-extension://abc ,',
      MAX_ACTIVE: '9',
      RETENTION_MINUTES: '30',
      TRUST_PROXY: 'false',
    });
    expect(c.allowedOrigins).toEqual(['https://a.example', 'chrome-extension://abc']);
    expect(c.maxActive).toBe(1); // out of range -> default
    expect(c.retentionMs).toBe(30 * 60_000);
    expect(c.trustProxy).toBe(false);
    expect(loadConfig({ MAX_ACTIVE: '2' }).maxActive).toBe(2);
  });
  it('safeEqual compares across lengths', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('loadDotEnv', () => {
  it('reads KEY=VALUE lines, ignores comments/empty values, never overrides existing variables', () => {
    const dir = tempDir();
    const file = path.join(dir, '.env');
    fs.writeFileSync(
      file,
      [
        '# comment',
        'MUSIK_TOKEN="abc def"',
        "PORT='3001'",
        'EMPTY=',
        'KEEP=from-file',
        'bad line',
        '1BAD=x',
        '',
      ].join('\r\n'),
    );
    const env: NodeJS.ProcessEnv = { KEEP: 'from-shell' };
    const loaded = loadDotEnv(file, env);
    expect(loaded.sort()).toEqual(['MUSIK_TOKEN', 'PORT']);
    expect(env['MUSIK_TOKEN']).toBe('abc def');
    expect(env['PORT']).toBe('3001');
    expect(env['KEEP']).toBe('from-shell');
    expect(env['EMPTY']).toBeUndefined();
    expect(loadDotEnv(path.join(dir, 'missing.env'), {})).toEqual([]);
    removeDir(dir);
  });
});

describe('health and auth gate', () => {
  it('GET /api/health is public and reports version and yt-dlp', async () => {
    s = await startApp();
    const body = await (await fetch(`${s.base}/api/health`)).json();
    expect(body).toMatchObject({ status: 'ok', version: 't', configured: true });
    // node stands in for yt-dlp: `node --version` works
    expect(body.ytdlp).toBe(process.version);
  });

  it('health explains why yt-dlp is unusable without leaking paths', async () => {
    s = await startApp({ YTDLP_PATH: '/definitely/not/here/yt-dlp', FFMPEG_PATH: '/nope/ffmpeg' });
    const bad = await (await fetch(`${s.base}/api/health`)).json();
    expect(bad).toMatchObject({ ytdlp: null, ytdlpProblem: 'not_found', ffmpegFound: false });
    expect(JSON.stringify(bad)).not.toContain('definitely');
    await s.close();
    s = await startApp({ YTDLP_PATH: '' });
    const none = await (await fetch(`${s.base}/api/health`)).json();
    expect(none).toMatchObject({ ytdlp: null, ytdlpProblem: 'not_configured', ffmpegFound: null });
    await s.close();
    s = await startApp();
    const ok = await (await fetch(`${s.base}/api/health`)).json();
    expect(ok.ytdlpProblem).toBeNull();
  });

  it('works when mounted under a sub-path (Passenger keeps the full URL, e.g. /musik-api/api/...)', async () => {
    s = await startApp();
    const health = await (await fetch(`${s.base}/musik-api/api/health`)).json();
    expect(health.status).toBe('ok');
    const created = await fetch(`${s.base}/musik-api/api/jobs`, {
      method: 'POST',
      headers: { ...json, ...auth },
      body: JSON.stringify({ url: 'https://youtu.be/OKAYxxxxxxx' }),
    });
    expect(created.status).toBe(202);
    const job = await created.json();
    const got = await fetch(`${s.base}/a/b/api/jobs/${job.id}`, { headers: auth });
    expect(got.status).toBe(200);
    // not under /api/: still a plain 404 after auth
    expect((await fetch(`${s.base}/musik-api/other`, { headers: auth })).status).toBe(404);
  });

  it('without MUSIK_TOKEN only health works and others say why', async () => {
    s = await startApp({ MUSIK_TOKEN: '' });
    expect((await fetch(`${s.base}/api/health`)).status).toBe(200);
    const res = await post(s.base, { url: YT('a') });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('server_not_configured');
  });

  it('rejects missing, wrong and mis-schemed tokens; unknown paths need a token too', async () => {
    s = await startApp();
    expect((await post(s.base, { url: YT('a') })).status).toBe(401);
    expect((await post(s.base, { url: YT('a') }, { authorization: 'Bearer nope' })).status).toBe(
      401,
    );
    expect((await post(s.base, { url: YT('a') }, { authorization: TOKEN })).status).toBe(401);
    expect((await fetch(`${s.base}/nope`)).status).toBe(401);
    expect((await fetch(`${s.base}/nope`, { headers: auth })).status).toBe(404);
  });

  it('locks an IP out after repeated wrong tokens, even for the right token', async () => {
    s = await startApp();
    for (let i = 0; i < 5; i++) {
      expect((await fetch(`${s.base}/api/jobs/${'0'.repeat(32)}`)).status).toBe(401);
    }
    const blocked = await fetch(`${s.base}/api/jobs/${'0'.repeat(32)}`, { headers: auth });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    // health stays reachable
    expect((await fetch(`${s.base}/api/health`)).status).toBe(200);
  });

  it('lockout releases after the block time (fake clock)', async () => {
    let t = 10_000_000;
    s = await startApp({}, { now: () => t });
    for (let i = 0; i < 5; i++) await fetch(`${s.base}/api/jobs/${'0'.repeat(32)}`);
    expect((await fetch(`${s.base}/api/jobs/${'0'.repeat(32)}`, { headers: auth })).status).toBe(
      429,
    );
    t += 16 * 60_000;
    expect((await fetch(`${s.base}/api/jobs/${'0'.repeat(32)}`, { headers: auth })).status).toBe(
      404,
    );
  });

  it('trusts the last X-Forwarded-For entry only when TRUST_PROXY is on', async () => {
    s = await startApp({ TRUST_PROXY: 'true' });
    const wrong = (ip: string) =>
      fetch(`${s!.base}/api/jobs/${'0'.repeat(32)}`, {
        headers: { 'x-forwarded-for': `9.9.9.9, ${ip}` },
      });
    for (let i = 0; i < 5; i++) await wrong('7.7.7.7');
    // other client behind the proxy is not locked out
    const other = await fetch(`${s.base}/api/jobs/${'0'.repeat(32)}`, {
      headers: { ...auth, 'x-forwarded-for': '8.8.8.8' },
    });
    expect(other.status).toBe(404);
    const same = await fetch(`${s.base}/api/jobs/${'0'.repeat(32)}`, {
      headers: { ...auth, 'x-forwarded-for': '1.2.3.4, 7.7.7.7' },
    });
    expect(same.status).toBe(429);
  });
});

describe('POST /api/jobs validation (SSRF, playlist, abuse)', () => {
  const rejected: [string, unknown][] = [
    ['other host', 'https://example.com/watch?v=dQw4w9WgXcQ'],
    ['suffix trick', 'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ'],
    ['userinfo trick', 'https://youtube.com@evil.com/watch?v=dQw4w9WgXcQ'],
    ['loopback', 'http://127.0.0.1:3000/api/health'],
    ['metadata ip', 'http://169.254.169.254/latest/meta-data/'],
    ['file scheme', 'file:///etc/passwd'],
    ['playlist', 'https://www.youtube.com/playlist?list=PL1234567890'],
    ['option injection', 'https://youtu.be/dQw4w9WgXcQ --exec=calc'],
    ['missing url', undefined],
    ['number', 5],
  ];
  for (const [name, url] of rejected) {
    it(`rejects ${name} with 400 invalid_url`, async () => {
      s = await startApp();
      const res = await post(s.base, { url }, auth);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('invalid_url');
      expect(typeof body.message).toBe('string');
      expect(s.app.jobs.counts()).toEqual({ active: 0, queued: 0 });
    });
  }

  it('rejects bad content-type, bad JSON and oversized bodies', async () => {
    s = await startApp();
    const ct = await fetch(`${s.base}/api/jobs`, { method: 'POST', headers: auth, body: 'url=x' });
    expect(ct.status).toBe(400);
    expect((await post(s.base, '{not json', auth)).status).toBe(400);
    const big = await post(s.base, { url: YT('a'), pad: 'x'.repeat(5000) }, auth).catch(() => null);
    expect(big === null || big.status === 413).toBe(true);
  });

  it('rate limits job creation per IP', async () => {
    s = await startApp({ MAX_QUEUE: '10' });
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++)
      statuses.push((await post(s.base, { url: YT('SLOW' + i) }, auth)).status);
    expect(statuses.filter((x) => x === 202).length).toBeGreaterThan(0);
    expect(statuses).toContain(429);
    expect(statuses.indexOf(429)).toBeLessThanOrEqual(11);
  });
});

describe('job lifecycle over HTTP', () => {
  it('create -> poll -> signed download -> file bytes, token not needed for the link', async () => {
    s = await startApp();
    const create = await post(s.base, { url: `${YT('Ok')}?si=zzz&t=5` }, auth);
    expect(create.status).toBe(202);
    const job = await create.json();
    expect(job.status).toMatch(/queued|running/);
    expect(job.downloadUrl).toBeNull();

    let info: Record<string, unknown> = {};
    for (let i = 0; i < 600; i++) {
      info = await (await fetch(`${s.base}/api/jobs/${job.id}`, { headers: auth })).json();
      if (info['status'] === 'done' || info['status'] === 'error') break;
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(info['status']).toBe('done');
    expect(info['title']).toMatch(/^Judul Uji/);
    const link = info['downloadUrl'] as string;
    expect(link).toMatch(/^\/api\/files\/[0-9a-f]{32}\.mp3\?exp=\d+&sig=[0-9a-f]{64}$/);

    const file = await fetch(`${s.base}${link}`); // no Authorization header
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('audio/mpeg');
    expect(file.headers.get('content-disposition')).toMatch(/attachment; filename="Judul Uji/);
    const bytes = new Uint8Array(await file.arrayBuffer());
    expect(bytes.length).toBe(Number(file.headers.get('content-length')));
    expect(bytes.length).toBeGreaterThan(1000);

    // tampered / expired links and unauthenticated plain access fail
    expect((await fetch(`${s.base}${link.replace(/sig=./, 'sig=0')}`)).status).toBe(401);
    expect((await fetch(`${s.base}/api/files/${job.id}.mp3`)).status).toBe(401);
    // the bearer token works too
    expect((await fetch(`${s.base}/api/files/${job.id}.mp3`, { headers: auth })).status).toBe(200);
  });

  it('error jobs carry a clear code; unknown and malformed ids give 404', async () => {
    s = await startApp();
    const job = await (await post(s.base, { url: YT('FAIL') }, auth)).json();
    let info: Record<string, unknown> = {};
    for (let i = 0; i < 600; i++) {
      info = await (await fetch(`${s.base}/api/jobs/${job.id}`, { headers: auth })).json();
      if (info['status'] === 'error') break;
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(info['status']).toBe('error');
    expect(info['error']).toMatchObject({ code: 'unavailable' });
    expect(info['downloadUrl']).toBeNull();
    expect((await fetch(`${s.base}/api/jobs/${'f'.repeat(32)}`, { headers: auth })).status).toBe(
      404,
    );
    expect((await fetch(`${s.base}/api/jobs/..%2f..%2fetc`, { headers: auth })).status).toBe(404);
    expect(
      (await fetch(`${s.base}/api/files/${'f'.repeat(32)}.mp3`, { headers: auth })).status,
    ).toBe(404);
  });

  it('answers 429 busy with Retry-After when the queue is full', async () => {
    s = await startApp({ MAX_ACTIVE: '1', MAX_QUEUE: '0' });
    expect((await post(s.base, { url: YT('SLOW1') }, auth)).status).toBe(202);
    const busy = await post(s.base, { url: YT('SLOW2') }, auth);
    expect(busy.status).toBe(429);
    expect((await busy.json()).error).toBe('busy');
    expect(busy.headers.get('retry-after')).toBeTruthy();
  });

  it('expired jobs give 404 after the retention period (fake clock)', async () => {
    let t = 50_000_000;
    s = await startApp({}, { now: () => t });
    const job = await (await post(s.base, { url: YT('Ok') }, auth)).json();
    for (let i = 0; i < 600; i++) {
      const j = await (await fetch(`${s.base}/api/jobs/${job.id}`, { headers: auth })).json();
      if (j.status === 'done') break;
      await new Promise((r) => setTimeout(r, 25));
    }
    t += 61 * 60_000;
    s.app.jobs.sweep();
    expect((await fetch(`${s.base}/api/jobs/${job.id}`, { headers: auth })).status).toBe(404);
  });
});

describe('CORS', () => {
  it('allows only configured origins, answers preflight, and never reflects others', async () => {
    s = await startApp({ ALLOWED_ORIGINS: 'https://app.example, chrome-extension://abcdef' });
    const pre = await fetch(`${s.base}/api/jobs`, {
      method: 'OPTIONS',
      headers: { origin: 'https://app.example', 'access-control-request-method': 'POST' },
    });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('https://app.example');
    expect(pre.headers.get('access-control-allow-headers')).toMatch(/authorization/);

    const ext = await fetch(`${s.base}/api/health`, {
      headers: { origin: 'chrome-extension://abcdef' },
    });
    expect(ext.headers.get('access-control-allow-origin')).toBe('chrome-extension://abcdef');

    const evil = await fetch(`${s.base}/api/health`, {
      headers: { origin: 'https://evil.example' },
    });
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
    const evilPre = await fetch(`${s.base}/api/jobs`, {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
    });
    expect(evilPre.status).toBe(403);
    expect(evilPre.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('adds CORS headers to errors as well so the PWA can read them', async () => {
    s = await startApp({ ALLOWED_ORIGINS: 'https://app.example' });
    const res = await fetch(`${s.base}/api/jobs/${'0'.repeat(32)}`, {
      headers: { origin: 'https://app.example' },
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example');
  });
});

describe('logs', () => {
  it('never print the token', async () => {
    const lines: string[] = [];
    const orig = console.log;
    console.log = (...a: unknown[]) => void lines.push(a.join(' '));
    try {
      s = await startApp();
      const job = await (await post(s.base, { url: YT('Ok') }, auth)).json();
      for (let i = 0; i < 600; i++) {
        const j = await (await fetch(`${s.base}/api/jobs/${job.id}`, { headers: auth })).json();
        if (j.status === 'done') break;
        await new Promise((r) => setTimeout(r, 25));
      }
    } finally {
      console.log = orig;
    }
    expect(lines.join('\n')).not.toContain(TOKEN);
  });
});
