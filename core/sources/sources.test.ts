import { describe, expect, it } from 'vitest';
import { archiveTracks, cleanQuery, parseLength, searchArchive } from './archive';
import { searchCommons } from './commons';
import { MAX_DOWNLOAD_BYTES, downloadAudio, fileNameFor } from './download';
import { licenseFromOpenverse, licenseFromShortName, licenseFromUrl } from './license';
import { searchOpenverse } from './openverse';
import { searchSources } from './search';
import { defaultDir, mergeHits } from './sort';
import { parseYear } from './http';
import { SourceError, attributionLine, creditOf, type FetchLike, type SearchHit } from './types';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function fakeFetch(routes: Record<string, () => Response | Promise<Response>>): {
  fetch: FetchLike;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    fetch: async (url) => {
      calls.push(url);
      for (const [prefix, make] of Object.entries(routes)) {
        if (url.startsWith(prefix)) return make();
      }
      throw new TypeError('Failed to fetch');
    },
  };
}

describe('license', () => {
  it('parses Creative Commons URLs and flags NC / ND', () => {
    const l = licenseFromUrl('http://creativecommons.org/licenses/by-nc-nd/3.0/us/');
    expect(l).toMatchObject({ label: 'CC BY-NC-ND 3.0', commercial: false, derivatives: false });
    expect(licenseFromUrl('https://creativecommons.org/licenses/by-sa/4.0/')).toMatchObject({
      label: 'CC BY-SA 4.0',
      commercial: true,
      derivatives: true,
    });
    expect(licenseFromUrl('https://creativecommons.org/publicdomain/zero/1.0/')?.label).toBe('CC0');
    expect(licenseFromUrl('http://creativecommons.org/licenses/publicdomain/')?.label).toBe(
      'Domain publik',
    );
  });
  it('rejects anything that is not a known open license', () => {
    expect(licenseFromUrl(undefined)).toBeNull();
    expect(licenseFromUrl('')).toBeNull();
    expect(licenseFromUrl('not a url')).toBeNull();
    expect(licenseFromUrl('https://example.com/licenses/by/4.0/')).toBeNull();
    expect(licenseFromUrl('https://creativecommons.org/licenses/by-xx/4.0/')).toBeNull();
    expect(licenseFromOpenverse('all-rights-reserved', '1')).toBeNull();
    expect(licenseFromOpenverse('', '')).toBeNull();
    expect(licenseFromShortName('Copyrighted free use')).toBeNull();
    expect(licenseFromShortName('')).toBeNull();
  });
  it('maps Openverse and Commons names', () => {
    expect(licenseFromOpenverse('by-sa', '4.0')?.label).toBe('CC BY-SA 4.0');
    expect(licenseFromOpenverse('cc0', '1.0')?.label).toBe('CC0');
    expect(licenseFromOpenverse('pdm', '1.0')?.label).toBe('Domain publik');
    expect(licenseFromShortName('CC BY-SA 4.0')?.label).toBe('CC BY-SA 4.0');
    expect(licenseFromShortName('CC BY-NC 2.0')?.commercial).toBe(false);
    expect(licenseFromShortName('CC0')?.label).toBe('CC0');
    expect(licenseFromShortName('Public domain')?.label).toBe('Domain publik');
  });
});

describe('Internet Archive', () => {
  it('cleans Lucene syntax out of the query', () => {
    expect(cleanQuery('piano" OR (x) -y: z*')).toBe('piano OR x y z');
    expect(cleanQuery('  ')).toBe('');
  });
  it('drops items without a usable license and builds album hits', async () => {
    const f = fakeFetch({
      'https://archive.org/advancedsearch.php': () =>
        json({
          response: {
            numFound: 40,
            docs: [
              {
                identifier: 'a1',
                title: 'Album One',
                creator: ['Ann', 'Bob'],
                licenseurl: 'http://creativecommons.org/licenses/by/4.0/',
                item_size: '1000',
              },
              { identifier: 'a2', title: 'No license' },
              { identifier: 'a3', licenseurl: 'http://example.com/own' },
            ],
          },
        }),
    });
    const page = await searchArchive('piano', 'all', 1, 15, f.fetch);
    expect(page.hits).toHaveLength(1);
    expect(page.hits[0]).toMatchObject({
      source: 'archive',
      id: 'a1',
      creator: 'Ann, Bob',
      downloadUrl: null,
      size: 1000,
      pageUrl: 'https://archive.org/details/a1',
    });
    expect(page.hasMore).toBe(true);
    const url = new URL(f.calls[0]!);
    expect(url.searchParams.get('q')).toContain('licenseurl:*');
    expect(url.searchParams.get('q')).toContain('mediatype:audio');
  });
  it('does not call the network for an empty query', async () => {
    const f = fakeFetch({});
    expect((await searchArchive('  ', 'all', 1, 15, f.fetch)).hits).toEqual([]);
    expect(f.calls).toEqual([]);
  });
  it('lists the best audio files of an item with encoded download URLs', async () => {
    const f = fakeFetch({
      'https://archive.org/metadata/a%201': () =>
        json({
          files: [
            { name: 'cover.jpg', format: 'JPEG' },
            {
              name: 'one (live).mp3',
              format: 'VBR MP3',
              size: '5000',
              length: '3:05',
              title: 'One',
            },
            { name: 'one_64kb.mp3', format: '64Kbps MP3', size: '900' },
            { name: 'sub/two.mp3', format: 'VBR MP3', length: '125.5' },
          ],
        }),
    });
    const hit = {
      id: 'a 1',
      title: 'Album',
      creator: 'Ann',
      license: licenseFromUrl('https://creativecommons.org/licenses/by/4.0/')!,
      pageUrl: 'https://archive.org/details/a%201',
    };
    const tracks = await archiveTracks(hit, f.fetch);
    expect(tracks.map((t) => t.title)).toEqual(['One', 'two']);
    expect(tracks[0]).toMatchObject({
      downloadUrl: 'https://archive.org/download/a%201/one%20(live).mp3',
      durationSec: 185,
      size: 5000,
      mime: 'audio/mpeg',
      creator: 'Ann',
    });
    expect(tracks[1]!.downloadUrl).toBe('https://archive.org/download/a%201/sub/two.mp3');
    expect(tracks[1]!.durationSec).toBe(125.5);
  });
  it('falls back to Ogg when there is no good MP3', async () => {
    const f = fakeFetch({
      'https://archive.org/metadata/': () =>
        json({
          files: [
            { name: 'x.ogg', format: 'Ogg Vorbis' },
            { name: 'y.flac', format: 'Flac' },
          ],
        }),
    });
    const tracks = await archiveTracks(
      { id: 'z', title: 'z', creator: '', license: licenseFromOpenverse('cc0', '')!, pageUrl: '' },
      f.fetch,
    );
    expect(tracks.map((t) => [t.title, t.mime])).toEqual([['x', 'audio/ogg']]);
  });
  it('parses lengths', () => {
    expect(parseLength('1:02:03')).toBe(3723);
    expect(parseLength('20:25')).toBe(1225);
    expect(parseLength('1225.1')).toBe(1225.1);
    expect(parseLength(12)).toBe(12);
    expect(parseLength('x')).toBeNull();
    expect(parseLength(undefined)).toBeNull();
  });
});

describe('Openverse', () => {
  it('keeps https results with an open license and converts duration', async () => {
    const f = fakeFetch({
      'https://api.openverse.org/v1/audio/': () =>
        json({
          page_count: 3,
          results: [
            {
              id: 'u1',
              title: 'Piano Melody',
              creator: 'benpm',
              license: 'by',
              license_version: '4.0',
              url: 'https://cdn.freesound.org/previews/1.mp3',
              foreign_landing_url: 'https://freesound.org/s/1',
              filetype: 'mp3',
              duration: 10193,
              filesize: 2000,
            },
            {
              id: 'u2',
              title: 'Insecure',
              license: 'by',
              license_version: '4.0',
              url: 'http://example.com/x.mp3',
            },
            {
              id: 'u3',
              title: 'Closed',
              license: 'all-rights-reserved',
              url: 'https://e.com/x.mp3',
            },
          ],
        }),
    });
    const page = await searchOpenverse('piano', 'all', 1, 15, f.fetch);
    expect(page.hits).toHaveLength(1);
    expect(page.hits[0]).toMatchObject({
      source: 'openverse',
      durationSec: 10,
      mime: 'audio/mpeg',
      pageUrl: 'https://freesound.org/s/1',
      downloadUrl: 'https://cdn.freesound.org/previews/1.mp3',
    });
    expect(page.hasMore).toBe(true);
    expect(new URL(f.calls[0]!).searchParams.get('category')).toBe('music');
  });
});

describe('Wikimedia Commons', () => {
  it('reads license, artist and file URL; skips non-audio and unlicensed files', async () => {
    const f = fakeFetch({
      'https://commons.wikimedia.org/w/api.php': () =>
        json({
          continue: { gsroffset: 15 },
          query: {
            pages: [
              {
                title: 'File:Blue Danube.ogg',
                imageinfo: [
                  {
                    url: 'https://upload.wikimedia.org/a/aa/Blue_Danube.ogg?utm_source=x',
                    descriptionurl: 'https://commons.wikimedia.org/wiki/File:Blue_Danube.ogg',
                    mime: 'application/ogg',
                    size: 5236138,
                    extmetadata: {
                      Artist: { value: '<a href="//x">Han &amp; Co</a>' },
                      LicenseShortName: { value: 'CC BY-SA 4.0' },
                      LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
                    },
                  },
                ],
              },
              {
                title: 'File:Cover.png',
                imageinfo: [{ url: 'https://upload.wikimedia.org/c.png', mime: 'image/png' }],
              },
              {
                title: 'File:Closed.ogg',
                imageinfo: [
                  {
                    url: 'https://upload.wikimedia.org/d.ogg',
                    mime: 'application/ogg',
                    extmetadata: { LicenseShortName: { value: 'Copyrighted' } },
                  },
                ],
              },
            ],
          },
        }),
    });
    const page = await searchCommons('piano', 'all', 2, 15, f.fetch);
    expect(page.hits).toHaveLength(1);
    expect(page.hits[0]).toMatchObject({
      title: 'Blue Danube',
      creator: 'Han & Co',
      mime: 'audio/ogg',
      downloadUrl: 'https://upload.wikimedia.org/a/aa/Blue_Danube.ogg',
    });
    expect(page.hits[0]!.license.label).toBe('CC BY-SA 4.0');
    expect(page.hasMore).toBe(true);
    expect(new URL(f.calls[0]!).searchParams.get('gsroffset')).toBe('15');
  });
});

describe('searchSources', () => {
  it('returns the working sources even when one fails', async () => {
    const f = fakeFetch({
      'https://archive.org/advancedsearch.php': () => json({ response: { docs: [], numFound: 0 } }),
      'https://api.openverse.org/': () => json({ error: 'x' }, 500),
    });
    const results = await searchSources(
      'piano',
      'all',
      ['archive', 'openverse', 'commons'],
      1,
      f.fetch,
    );
    expect(results.map((r) => [r.source, r.page ? 'ok' : r.error?.code])).toEqual([
      ['archive', 'ok'],
      ['openverse', 'http'],
      ['commons', 'network'],
    ]);
  });
});

describe('downloadAudio', () => {
  const audio = (bytes: number, headers: Record<string, string> = {}) =>
    new Response(new Uint8Array(bytes), {
      status: 200,
      headers: { 'content-type': 'audio/mpeg', ...headers },
    });

  it('downloads, reports progress and returns the mime', async () => {
    const seen: number[] = [];
    const { blob, mime } = await downloadAudio('https://x.example/a.mp3', {
      fetch: async () => audio(1000, { 'content-length': '1000' }),
      onProgress: (r) => seen.push(r),
    });
    expect(blob.size).toBe(1000);
    expect(mime).toBe('audio/mpeg');
    expect(seen.at(-1)).toBe(1000);
  });
  it('rejects non-https, HTML pages, errors and network failures', async () => {
    const code = async (url: string, fetchFn: FetchLike) =>
      downloadAudio(url, { fetch: fetchFn }).catch((e: SourceError) => e.code);
    expect(await code('http://x.example/a.mp3', async () => audio(1))).toBe('bad_url');
    expect(
      await code(
        'https://x.example/a',
        async () => new Response('<html>', { headers: { 'content-type': 'text/html' } }),
      ),
    ).toBe('not_audio');
    expect(await code('https://x.example/a', async () => new Response('no', { status: 404 }))).toBe(
      'http',
    );
    expect(
      await code('https://x.example/a', async () => {
        throw new TypeError('Failed to fetch');
      }),
    ).toBe('network');
  });
  it('enforces the size limit from the header and while streaming', async () => {
    const big = await downloadAudio('https://x.example/a', {
      fetch: async () => audio(10, { 'content-length': String(MAX_DOWNLOAD_BYTES + 1) }),
    }).catch((e: SourceError) => e.code);
    expect(big).toBe('too_large');
    const stream = await downloadAudio('https://x.example/a', {
      fetch: async () => audio(500),
      maxBytes: 100,
    }).catch((e: SourceError) => e.code);
    expect(stream).toBe('too_large');
  });
  it('uses the fallback type for generic octet-stream answers', async () => {
    const { mime } = await downloadAudio('https://x.example/a', {
      fetch: async () => audio(5, { 'content-type': 'application/octet-stream' }),
      fallbackMime: 'audio/ogg',
    });
    expect(mime).toBe('audio/ogg');
  });
});

describe('names and credit', () => {
  it('makes safe file names', () => {
    expect(fileNameFor('A/B: "C"?', 'audio/mpeg')).toBe('A_B_ _C_.mp3');
    expect(fileNameFor('  ', 'audio/ogg')).toBe('lagu.ogg');
    expect(fileNameFor('x', 'audio/unknown')).toBe('x.mp3');
  });
  it('builds an attribution line', () => {
    const hit = {
      source: 'commons' as const,
      id: 'x',
      title: 'Blue Danube',
      creator: 'Han',
      license: licenseFromShortName('CC BY-SA 4.0')!,
      pageUrl: 'https://commons.wikimedia.org/wiki/File:x.ogg',
      durationSec: null,
      size: null,
      year: null,
      downloadUrl: null,
      mime: null,
    };
    const line = attributionLine(hit.title, creditOf(hit));
    expect(line).toContain('"Blue Danube" oleh Han');
    expect(line).toContain('CC BY-SA 4.0');
    expect(line).toContain('Wikimedia Commons');
    expect(line).toContain('https://creativecommons.org/licenses/by-sa/4.0/');
  });
});

describe('search modes', () => {
  const empty = () =>
    json({ response: { docs: [], numFound: 0 }, results: [], query: { pages: [] } });
  it('Internet Archive searches the title or creator field', async () => {
    const f = fakeFetch({ 'https://archive.org/advancedsearch.php': empty });
    await searchArchive('moon river', 'title', 1, 15, f.fetch);
    await searchArchive('bach', 'artist', 1, 15, f.fetch);
    await searchArchive('bach', 'all', 1, 15, f.fetch);
    const q = f.calls.map((u) => new URL(u).searchParams.get('q')!);
    expect(q[0]).toMatch(/^title:\(moon river\) AND /);
    expect(q[1]).toMatch(/^creator:\(bach\) AND /);
    expect(q[2]).toMatch(/^\(bach\) AND /);
  });
  it('Openverse uses the title / creator parameter', async () => {
    const f = fakeFetch({ 'https://api.openverse.org/': empty });
    await searchOpenverse('moon river', 'title', 1, 15, f.fetch);
    await searchOpenverse('kevin', 'artist', 1, 15, f.fetch);
    await searchOpenverse('piano', 'all', 1, 15, f.fetch);
    const params = f.calls.map((u) => new URL(u).searchParams);
    expect(params[0]!.get('title')).toBe('moon river');
    expect(params[0]!.get('q')).toBeNull();
    expect(params[1]!.get('creator')).toBe('kevin');
    expect(params[2]!.get('q')).toBe('piano');
  });
  const commonsPages = () =>
    json({
      query: {
        pages: [
          {
            title: 'File:A.ogg',
            imageinfo: [
              {
                url: 'https://upload.wikimedia.org/a.ogg',
                mime: 'application/ogg',
                extmetadata: {
                  Artist: { value: 'Clara Schumann' },
                  DateTimeOriginal: { value: 'circa 1935<div>x</div>' },
                  LicenseShortName: { value: 'CC0' },
                },
              },
            ],
          },
          {
            title: 'File:B.ogg',
            imageinfo: [
              {
                url: 'https://upload.wikimedia.org/b.ogg',
                mime: 'application/ogg',
                extmetadata: {
                  Artist: { value: 'Someone Else' },
                  LicenseShortName: { value: 'CC0' },
                },
              },
            ],
          },
        ],
      },
    });
  it('Commons: title mode requires every word in the file name', async () => {
    const f = fakeFetch({ 'https://commons.wikimedia.org/': commonsPages });
    await searchCommons('blue danube', 'title', 1, 15, f.fetch);
    expect(new URL(f.calls[0]!).searchParams.get('gsrsearch')).toBe(
      'intitle:blue intitle:danube filetype:audio',
    );
  });
  it('Commons: artist mode filters on the Artist metadata and reads the year', async () => {
    const f = fakeFetch({ 'https://commons.wikimedia.org/': commonsPages });
    const page = await searchCommons('schumann', 'artist', 1, 15, f.fetch);
    expect(page.hits.map((h) => h.title)).toEqual(['A']);
    expect(page.hits[0]!.year).toBe(1935);
    const all = await searchCommons('schumann', 'all', 1, 15, f.fetch);
    expect(all.hits).toHaveLength(2);
  });
  it('Internet Archive reads year, falling back to date', async () => {
    const lic = 'https://creativecommons.org/licenses/by/4.0/';
    const f = fakeFetch({
      'https://archive.org/advancedsearch.php': () =>
        json({
          response: {
            numFound: 3,
            docs: [
              { identifier: 'a', licenseurl: lic, year: 2014 },
              { identifier: 'b', licenseurl: lic, date: '2007-01-01T00:00:00Z' },
              { identifier: 'c', licenseurl: lic },
            ],
          },
        }),
    });
    const page = await searchArchive('x', 'all', 1, 15, f.fetch);
    expect(page.hits.map((h) => h.year)).toEqual([2014, 2007, null]);
  });
  it('parses years out of free text', () => {
    expect(parseYear('circa 1935')).toBe(1935);
    expect(parseYear('April 1916. first published 1909')).toBe(1916);
    expect(parseYear('2025-06-03')).toBe(2025);
    expect(parseYear(2014)).toBe(2014);
    expect(parseYear('page 12345')).toBeNull();
    expect(parseYear('3025')).toBeNull();
    expect(parseYear('')).toBeNull();
  });
});

describe('mergeHits', () => {
  const lic = licenseFromShortName('CC0')!;
  const hit = (
    source: SearchHit['source'],
    title: string,
    creator: string,
    size: number | null,
    year: number | null,
  ): SearchHit => ({
    source,
    id: `${source}-${title}`,
    title,
    creator,
    license: lic,
    pageUrl: '',
    durationSec: null,
    size,
    year,
    downloadUrl: null,
    mime: null,
  });
  const a = [hit('archive', 'Zebra', 'bob', 300, 1999), hit('archive', 'Apple', '', 100, null)];
  const o = [
    hit('openverse', 'Mango', 'Ann', null, 2010),
    hit('openverse', 'Berry', 'carl', 200, 1980),
  ];
  const titles = (key: Parameters<typeof mergeHits>[1], dir: Parameters<typeof mergeHits>[2]) =>
    mergeHits([{ hits: a }, { hits: o }], key, dir).map((h) => h.title);

  it('interleaves the sources by relevance', () => {
    expect(titles('relevance', 'asc')).toEqual(['Zebra', 'Mango', 'Apple', 'Berry']);
  });
  it('sorts by title, ignoring case', () => {
    expect(titles('title', 'asc')).toEqual(['Apple', 'Berry', 'Mango', 'Zebra']);
    expect(titles('title', 'desc')).toEqual(['Zebra', 'Mango', 'Berry', 'Apple']);
  });
  it('sorts by artist; items without an artist are always last', () => {
    expect(titles('artist', 'asc')).toEqual(['Mango', 'Zebra', 'Berry', 'Apple']);
    expect(titles('artist', 'desc')).toEqual(['Berry', 'Zebra', 'Mango', 'Apple']);
  });
  it('sorts by size and year; unknown values are always last', () => {
    expect(titles('size', 'asc')).toEqual(['Apple', 'Berry', 'Zebra', 'Mango']);
    expect(titles('size', 'desc')).toEqual(['Zebra', 'Berry', 'Apple', 'Mango']);
    expect(titles('year', 'desc')).toEqual(['Mango', 'Zebra', 'Berry', 'Apple']);
    expect(titles('year', 'asc')).toEqual(['Berry', 'Zebra', 'Mango', 'Apple']);
  });
  it('handles empty input and picks sensible default directions', () => {
    expect(mergeHits([], 'title', 'asc')).toEqual([]);
    expect(mergeHits([{ hits: [] }], 'size', 'desc')).toEqual([]);
    expect(defaultDir('title')).toBe('asc');
    expect(defaultDir('artist')).toBe('asc');
    expect(defaultDir('size')).toBe('desc');
    expect(defaultDir('year')).toBe('desc');
  });
});
