import { describe, expect, it } from 'vitest';
import {
  ApiClient,
  ApiError,
  buildAppLink,
  extractYoutubeUrl,
  normalizeBaseUrl,
  parseYoutubeVideoId,
  type JobView,
} from './client';

function reply(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function client(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const c = new ApiClient({
    baseUrl: 'https://srv.example/app/',
    token: 'tok',
    timeoutMs: 500,
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return handler(url, init);
    }) as typeof fetch,
  });
  return { c, calls };
}

const job = (over: Partial<JobView>): JobView => ({
  id: 'a'.repeat(32),
  videoId: 'dQw4w9WgXcQ',
  status: 'queued',
  stage: null,
  title: null,
  duration: null,
  size: null,
  error: null,
  downloadUrl: null,
  ...over,
});

describe('helpers', () => {
  it('normalizeBaseUrl', () => {
    expect(normalizeBaseUrl(' https://a.example/app/// ')).toBe('https://a.example/app');
    expect(normalizeBaseUrl('http://localhost:3000')).toBe('http://localhost:3000');
    expect(normalizeBaseUrl('ftp://a')).toBeNull();
    expect(normalizeBaseUrl('a.example')).toBeNull();
    expect(normalizeBaseUrl('https://u:p@a.example')).toBeNull();
    expect(normalizeBaseUrl('')).toBeNull();
  });
  it('extractYoutubeUrl finds the link inside shared text', () => {
    expect(extractYoutubeUrl('Lagu bagus https://youtu.be/dQw4w9WgXcQ?si=x cek ini')).toBe(
      'https://youtu.be/dQw4w9WgXcQ?si=x',
    );
    expect(extractYoutubeUrl(null, 'https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toContain(
      'music.youtube.com',
    );
    expect(extractYoutubeUrl('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(extractYoutubeUrl('https://youtube.com.evil.com/x', undefined)).toBeNull();
    expect(extractYoutubeUrl('tidak ada link')).toBeNull();
  });
});

describe('buildAppLink', () => {
  it('builds the app URL with the encoded video URL', () => {
    expect(
      buildAppLink('https://app.example/musik/', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5'),
    ).toBe(
      'https://app.example/musik/?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ%26t%3D5',
    );
    expect(buildAppLink('not a url', 'https://youtu.be/dQw4w9WgXcQ')).toBeNull();
    expect(buildAppLink('https://app.example', 'https://example.com/x')).toBeNull();
  });
});

describe('ApiClient', () => {
  it('sends the Bearer token and JSON body to the right URL', async () => {
    const { c, calls } = client(() => reply(202, job({})));
    const j = await c.createJob('https://youtu.be/dQw4w9WgXcQ');
    expect(j.status).toBe('queued');
    expect(calls[0]!.url).toBe('https://srv.example/app/api/jobs'.replace('/app/', '/app/'));
    const h = calls[0]!.init.headers as Record<string, string>;
    expect(h['authorization']).toBe('Bearer tok');
    expect(h['content-type']).toBe('application/json');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      url: 'https://youtu.be/dQw4w9WgXcQ',
    });
  });

  it('search encodes the query and returns the results', async () => {
    const results = [
      { videoId: 'aaaaaaaaaaa', title: 'T', channel: null, duration: 60, thumbnail: 'u' },
    ];
    const { c, calls } = client(() => reply(200, { query: 'a&b c', results }));
    expect(await c.search('a&b c')).toEqual(results);
    expect(calls[0]!.url).toBe('https://srv.example/app/api/search?q=a%26b%20c');
    const h = calls[0]!.init.headers as Record<string, string>;
    expect(h['authorization']).toBe('Bearer tok');
  });

  it('search maps a server failure to an ApiError', async () => {
    const { c } = client(() => reply(502, { error: 'search_failed', reason: 'failed' }));
    await expect(c.search('x')).rejects.toMatchObject({ code: 'server' });
  });

  it('health needs no token', async () => {
    const { c, calls } = client(() =>
      reply(200, { status: 'ok', version: '1', ytdlp: null, configured: true }),
    );
    expect((await c.health()).status).toBe('ok');
    expect((calls[0]!.init.headers as Record<string, string>)['authorization']).toBeUndefined();
  });

  it('refuses to call without server settings', async () => {
    const c = new ApiClient({ baseUrl: '', token: '' });
    await expect(c.createJob('x')).rejects.toMatchObject({ code: 'no_server' });
    await expect(c.health()).rejects.toMatchObject({ code: 'no_server' });
  });

  const errorCases: [string, number, unknown, Record<string, string>, string][] = [
    ['wrong token', 401, { error: 'unauthorized' }, {}, 'unauthorized'],
    ['invalid url', 400, { error: 'invalid_url', reason: 'host', message: 'x' }, {}, 'invalid_url'],
    ['busy', 429, { error: 'busy' }, { 'retry-after': '15' }, 'busy'],
    [
      'lockout',
      429,
      { error: 'rate_limited', message: 'Terlalu banyak token salah.' },
      {},
      'locked_out',
    ],
    [
      'rate limit',
      429,
      { error: 'rate_limited', message: 'Terlalu banyak permintaan.' },
      {},
      'rate_limited',
    ],
    ['not configured', 503, { error: 'server_not_configured' }, {}, 'not_configured'],
    ['proxy error page', 502, '<html>Bad gateway</html>', {}, 'server'],
  ];
  for (const [name, status, body, headers, code] of errorCases) {
    it(`maps ${name} to ${code}`, async () => {
      const { c } = client(() => reply(status, body, headers));
      await expect(c.createJob('u')).rejects.toMatchObject({ code });
    });
  }

  it('keeps retry-after and the server reason', async () => {
    const { c } = client(() =>
      reply(429, { error: 'busy', message: 'm' }, { 'retry-after': '15' }),
    );
    const err = (await c.createJob('u').catch((e) => e)) as ApiError;
    expect(err.details.retryAfterSec).toBe(15);
    expect(err.details.status).toBe(429);
  });

  it('reports network failures and timeouts as network', async () => {
    const down = client(() => {
      throw new TypeError('failed to fetch');
    });
    await expect(down.c.getJob('a'.repeat(32))).rejects.toMatchObject({ code: 'network' });
    const slow = client(
      (_u, init) =>
        new Promise<Response>((_res, rej) => {
          init.signal?.addEventListener('abort', () =>
            rej(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    await expect(slow.c.getJob('a'.repeat(32))).rejects.toMatchObject({ code: 'network' });
  });

  it('checkAuth: 404 means the token is valid, 401 means it is not', async () => {
    const ok = client(() => reply(404, { error: 'not_found' }));
    await expect(ok.c.checkAuth()).resolves.toBeUndefined();
    const bad = client(() => reply(401, { error: 'unauthorized' }));
    await expect(bad.c.checkAuth()).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('waitForJob polls through queued/running to done', async () => {
    const seq = [
      job({ status: 'queued' }),
      job({ status: 'running', stage: 'download' }),
      job({ status: 'running', stage: 'convert' }),
      job({ status: 'done', title: 'T', downloadUrl: '/api/files/x.mp3?exp=1&sig=2' }),
    ];
    const { c } = client(() => reply(200, seq.shift()));
    const seen: string[] = [];
    const done = await c.waitForJob('a'.repeat(32), (j) => seen.push(`${j.status}/${j.stage}`), {
      intervalMs: 1,
    });
    expect(seen).toEqual(['queued/null', 'running/download', 'running/convert', 'done/null']);
    expect(done.title).toBe('T');
  });

  it('waitForJob turns a failed job into job_failed with the code', async () => {
    const { c } = client(() =>
      reply(
        200,
        job({ status: 'error', error: { code: 'too_long', message: 'Video terlalu panjang.' } }),
      ),
    );
    await expect(
      c.waitForJob('a'.repeat(32), () => undefined, { intervalMs: 1 }),
    ).rejects.toMatchObject({
      code: 'job_failed',
      details: { jobError: 'too_long' },
    });
  });

  it('waitForJob gives up after the deadline', async () => {
    const { c } = client(() => reply(200, job({ status: 'running' })));
    await expect(
      c.waitForJob('a'.repeat(32), () => undefined, { intervalMs: 5, timeoutMs: 30 }),
    ).rejects.toMatchObject({ code: 'timeout' });
  });

  it('download resolves relative links against the server and returns a Blob', async () => {
    const { c, calls } = client(() => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const blob = await c.download('/api/files/abc.mp3?exp=1&sig=2');
    expect(blob.size).toBe(3);
    expect(calls[0]!.url).toBe('https://srv.example/app/api/files/abc.mp3?exp=1&sig=2');
    expect(
      (calls[0]!.init.headers as Record<string, string> | undefined)?.['authorization'],
    ).toBeUndefined();
  });
});

describe('parseYoutubeVideoId', () => {
  const ID = 'dQw4w9WgXcQ';
  it('reads the id from the usual single-video URLs', () => {
    expect(parseYoutubeVideoId(`https://www.youtube.com/watch?v=${ID}&t=5`)).toBe(ID);
    expect(parseYoutubeVideoId(`https://youtu.be/${ID}?si=x`)).toBe(ID);
    expect(parseYoutubeVideoId(`https://music.youtube.com/watch?v=${ID}&list=RDx`)).toBe(ID);
    expect(parseYoutubeVideoId(`https://m.youtube.com/shorts/${ID}`)).toBe(ID);
    expect(parseYoutubeVideoId(`  https://youtube.com/embed/${ID}  `)).toBe(ID);
  });
  it('rejects other hosts, playlists and malformed input', () => {
    expect(parseYoutubeVideoId(`https://evil.example/watch?v=${ID}`)).toBeNull();
    expect(parseYoutubeVideoId('https://www.youtube.com/playlist?list=PL123')).toBeNull();
    expect(parseYoutubeVideoId('https://www.youtube.com/watch?v=short')).toBeNull();
    expect(parseYoutubeVideoId('ftp://youtu.be/' + ID)).toBeNull();
    expect(parseYoutubeVideoId('bukan url')).toBeNull();
  });
});
