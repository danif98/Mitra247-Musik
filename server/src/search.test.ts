import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SearchCache, buildSearchArgs, cleanOffset, cleanQuery, parseSearchOutput } from './search';
import { TOKEN, auth, startApp, type Started } from '../test/helpers';

let s: Started | undefined;
afterEach(async () => {
  await s?.close();
  s = undefined;
});

const get = (base: string, q: string, headers: Record<string, string> = auth) =>
  fetch(`${base}/api/search?q=${encodeURIComponent(q)}`, { headers });

describe('cleanQuery', () => {
  it('collapses whitespace, strips control characters and limits the length', () => {
    expect(cleanQuery('  a \n\t b\u0000c  ')).toBe('a b c');
    expect(cleanQuery('x'.repeat(500))?.length).toBe(100);
    expect(cleanQuery('   ')).toBeNull();
    expect(cleanQuery(undefined)).toBeNull();
    expect(cleanQuery(42)).toBeNull();
  });
});

describe('cleanOffset', () => {
  it('accepts whole numbers only and caps them', () => {
    expect(cleanOffset('30')).toBe(30);
    expect(cleanOffset('-5')).toBe(0);
    expect(cleanOffset('abc')).toBe(0);
    expect(cleanOffset(null)).toBe(0);
    expect(cleanOffset('9999')).toBe(150);
  });
});

describe('buildSearchArgs', () => {
  it('asks for later pages with --playlist-items and a deeper search', () => {
    const args = buildSearchArgs(
      { dataDir: '/d', jsRuntime: undefined, proxy: undefined },
      'q',
      undefined,
      15,
    );
    expect(args).toEqual(expect.arrayContaining(['--playlist-items', '16-30']));
    expect(args.at(-1)).toBe('ytsearchdate30:q');
  });
  it('passes the query as one argument after --, so it cannot become an option', () => {
    const args = buildSearchArgs(
      { dataDir: '/d', jsRuntime: undefined, proxy: undefined },
      '--exec evil',
    );
    expect(args.slice(-2)).toEqual(['--', 'ytsearchdate15:--exec evil']);
    expect(args).toContain('--flat-playlist');
    expect(args).not.toContain('--proxy');
  });
  it('adds proxy, js runtime and cookies when configured', () => {
    const args = buildSearchArgs(
      { dataDir: '/d', jsRuntime: 'node', proxy: 'http://p:1' },
      'q',
      '/tmp/c.txt',
    );
    expect(args).toEqual(
      expect.arrayContaining(['--proxy', 'http://p:1', '--cookies', '/tmp/c.txt']),
    );
    expect(args).toEqual(expect.arrayContaining(['--js-runtimes', 'node']));
  });
});

describe('parseSearchOutput', () => {
  it('keeps valid entries and drops live, too long, bad id, duplicates and non-JSON lines', () => {
    const lines = [
      'not json',
      JSON.stringify({ id: 'aaaaaaaaaaa', title: ' Satu ', duration: 185.4, channel: 'K' }),
      JSON.stringify({ id: 'bbbbbbbbbbb', title: 'Dua', duration: 60, uploader: 'U' }),
      JSON.stringify({ id: 'ccccccccccc', title: 'Live', duration: null }),
      JSON.stringify({ id: 'ddddddddddd', title: 'Panjang', duration: 5000 }),
      JSON.stringify({ id: 'bad id', title: 'Rusak', duration: 10 }),
      JSON.stringify({ id: 'aaaaaaaaaaa', title: 'Ganda', duration: 10 }),
      JSON.stringify({ id: 'eeeeeeeeeee', title: '', duration: 10 }),
    ].join('\n');
    const r = parseSearchOutput(lines, 1200);
    expect(r.map((x) => x.videoId)).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb']);
    expect(r[0]).toEqual({
      videoId: 'aaaaaaaaaaa',
      title: 'Satu',
      channel: 'K',
      duration: 185,
      thumbnail: 'https://i.ytimg.com/vi/aaaaaaaaaaa/mqdefault.jpg',
    });
    expect(r[1]!.channel).toBe('U');
  });
});

describe('SearchCache', () => {
  it('expires entries and evicts the oldest when full', () => {
    let t = 0;
    const c = new SearchCache(1000, 2, () => t);
    c.set('a', []);
    c.set('b', []);
    c.set('c', []);
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')).toEqual([]);
    t = 1500;
    expect(c.get('b')).toBeUndefined();
  });
});

describe('GET /api/search', () => {
  it('needs the token', async () => {
    s = await startApp();
    expect((await get(s.base, 'lagu', {})).status).toBe(401);
  });

  it('rejects an empty query', async () => {
    s = await startApp();
    const res = await get(s.base, '   ');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_query');
  });

  it('returns results from yt-dlp without a shell and without the token in the child', async () => {
    s = await startApp();
    const res = await get(s.base, 'lagu "; rm -rf /');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results.map((r: { videoId: string }) => r.videoId)).toEqual([
      'aaaaaaaaaaa',
      'bbbbbbbbbbb',
    ]);
    expect(body.results[1].duration).toBe(240);
    const argv = JSON.parse(fs.readFileSync(path.join(s.dataDir, 'search-argv.json'), 'utf8'));
    expect(argv.args.at(-2)).toBe('--');
    expect(argv.args.at(-1)).toBe('ytsearchdate15:lagu "; rm -rf /');
    expect(body.hasMore).toBe(false);
    expect(JSON.stringify(argv)).not.toContain(TOKEN);
  });

  it('serves a repeated query from the cache', async () => {
    s = await startApp();
    expect((await get(s.base, 'Sama')).status).toBe(200);
    fs.rmSync(path.join(s.dataDir, 'search-argv.json'));
    expect((await get(s.base, 'sama')).status).toBe(200);
    expect(fs.existsSync(path.join(s.dataDir, 'search-argv.json'))).toBe(false);
  });

  it('returns an empty list when nothing matches', async () => {
    s = await startApp();
    const res = await get(s.base, 'NONE');
    expect(res.status).toBe(200);
    expect((await res.json()).results).toEqual([]);
  });

  it('maps yt-dlp failures to 502 with a coarse reason', async () => {
    s = await startApp();
    const failed = await get(s.base, 'FAILQ');
    expect(failed.status).toBe(502);
    expect((await failed.json()).reason).toBe('failed');
    const blocked = await get(s.base, 'BOTQ');
    expect(blocked.status).toBe(502);
    expect((await blocked.json()).reason).toBe('blocked');
  });

  it('is rate limited', async () => {
    // A missing yt-dlp binary fails at once, so the limiter can be exercised without 15 slow spawns.
    s = await startApp({ YTDLP_PATH: path.join(process.cwd(), 'no-such-ytdlp-binary') });
    const statuses: number[] = [];
    for (let i = 0; i < 17; i++) statuses.push((await get(s.base, `q${i}`)).status);
    expect(statuses.slice(0, 15).every((x) => x === 502)).toBe(true);
    expect(statuses[16]).toBe(429);
  });
});
