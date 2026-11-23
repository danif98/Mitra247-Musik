/** Internet Archive: advanced search for audio items with a Creative Commons / public domain license. */
import { asNumber, asString, getJson, isRecord } from './http';
import { licenseFromUrl } from './license';
import type { FetchLike, SearchHit, SearchPage, SourceTrack } from './types';

const BASE = 'https://archive.org';

/** Lucene special characters become spaces: the user text is a plain word search. */
export function cleanQuery(query: string): string {
  return query
    .replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function searchArchive(
  query: string,
  page: number,
  pageSize: number,
  fetchFn: FetchLike,
  signal?: AbortSignal,
): Promise<SearchPage> {
  const q = cleanQuery(query);
  if (!q) return { source: 'archive', hits: [], hasMore: false };
  // licenseurl:* keeps only items that carry a license; audiobooks and podcasts are not music.
  const lucene = `(${q}) AND mediatype:audio AND licenseurl:* AND -collection:(librivoxaudio OR audio_bookspoetry OR podcasts)`;
  const params = new URLSearchParams();
  params.set('q', lucene);
  for (const f of ['identifier', 'title', 'creator', 'licenseurl', 'item_size']) {
    params.append('fl[]', f);
  }
  params.append('sort[]', 'downloads desc');
  params.set('rows', String(pageSize));
  params.set('page', String(page));
  params.set('output', 'json');
  const json = await getJson(fetchFn, `${BASE}/advancedsearch.php?${params.toString()}`, signal);
  const response = isRecord(json) && isRecord(json['response']) ? json['response'] : null;
  const docs = response ? response['docs'] : null;
  const total = response ? asNumber(response['numFound']) : null;
  if (!Array.isArray(docs)) return { source: 'archive', hits: [], hasMore: false };
  const hits: SearchHit[] = [];
  for (const d of docs) {
    if (!isRecord(d)) continue;
    const identifier = asString(d['identifier']);
    const license = licenseFromUrl(asString(d['licenseurl']));
    if (!identifier || !license) continue;
    hits.push({
      source: 'archive',
      id: identifier,
      title: asString(d['title']) || identifier,
      creator: asString(d['creator']),
      license,
      pageUrl: `${BASE}/details/${encodeURIComponent(identifier)}`,
      durationSec: null,
      size: asNumber(d['item_size']),
      downloadUrl: null,
      mime: null,
    });
  }
  return { source: 'archive', hits, hasMore: page * pageSize < (total ?? 0) };
}

const MAX_TRACKS = 100;
const MP3_GOOD = /^(VBR MP3|MP3|(128|192|256|320)Kbps MP3)$/i;

/** "20:25", "1225.1" or 1225.1 -> seconds. */
export function parseLength(v: unknown): number | null {
  const s = asString(typeof v === 'number' ? String(v) : v);
  if (!s) return null;
  if (s.includes(':')) {
    const parts = s.split(':').map(Number);
    if (parts.some((p) => !Number.isFinite(p))) return null;
    return parts.reduce((acc, p) => acc * 60 + p, 0);
  }
  return asNumber(s);
}

/** Playable files of an item: best MP3 variants, else Ogg Vorbis, else the 64 kbps MP3. */
export async function archiveTracks(
  hit: Pick<SearchHit, 'id' | 'title' | 'creator' | 'license' | 'pageUrl'>,
  fetchFn: FetchLike,
  signal?: AbortSignal,
): Promise<SourceTrack[]> {
  const json = await getJson(fetchFn, `${BASE}/metadata/${encodeURIComponent(hit.id)}`, signal);
  const files = isRecord(json) && Array.isArray(json['files']) ? json['files'] : [];
  const rows = files.filter(isRecord).filter((f) => asString(f['name']) !== '');
  const byFormat = (test: (format: string) => boolean) =>
    rows.filter((f) => test(asString(f['format'])));
  let chosen = byFormat((f) => MP3_GOOD.test(f));
  if (chosen.length === 0) chosen = byFormat((f) => /^Ogg Vorbis$/i.test(f));
  if (chosen.length === 0) chosen = byFormat((f) => /^64Kbps MP3$/i.test(f));
  return chosen.slice(0, MAX_TRACKS).map((f) => {
    const name = asString(f['name']);
    const isOgg = /ogg/i.test(asString(f['format']));
    const path = name.split('/').map(encodeURIComponent).join('/');
    return {
      source: 'archive' as const,
      id: `${hit.id}/${name}`,
      title:
        asString(f['title']) || (name.split('/').pop() ?? name).replace(/\.[A-Za-z0-9]{1,5}$/, ''),
      creator: asString(f['creator']) || hit.creator,
      license: hit.license,
      pageUrl: hit.pageUrl,
      durationSec: parseLength(f['length']),
      size: asNumber(f['size']),
      downloadUrl: `${BASE}/download/${encodeURIComponent(hit.id)}/${path}`,
      mime: isOgg ? 'audio/ogg' : 'audio/mpeg',
    };
  });
}
