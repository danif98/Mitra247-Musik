/** Openverse (WordPress): aggregates Creative Commons audio (Jamendo, Freesound, Wikimedia, ...). */
import { asNumber, asString, decodeEntities, getJson, isRecord } from './http';
import { licenseFromOpenverse } from './license';
import type { FetchLike, SearchHit, SearchMode, SearchPage } from './types';

const MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
};

export async function searchOpenverse(
  query: string,
  mode: SearchMode,
  page: number,
  pageSize: number,
  fetchFn: FetchLike,
  signal?: AbortSignal,
): Promise<SearchPage> {
  const q = query.replace(/\s+/g, ' ').trim();
  if (!q) return { source: 'openverse', hits: [], hasMore: false };
  // Openverse has dedicated `title` and `creator` filters; it states no release year.
  const field = mode === 'title' ? 'title' : mode === 'artist' ? 'creator' : 'q';
  const params = new URLSearchParams({
    [field]: q,
    category: 'music',
    page: String(page),
    page_size: String(pageSize),
  });
  const json = await getJson(fetchFn, `https://api.openverse.org/v1/audio/?${params}`, signal);
  const results = isRecord(json) && Array.isArray(json['results']) ? json['results'] : [];
  const pages = isRecord(json) ? asNumber(json['page_count']) : null;
  const hits: SearchHit[] = [];
  for (const r of results) {
    if (!isRecord(r)) continue;
    const url = asString(r['url']);
    const license = licenseFromOpenverse(asString(r['license']), asString(r['license_version']));
    if (!/^https:\/\//i.test(url) || !license) continue;
    const type = asString(r['filetype']).toLowerCase() || (/\.(\w{2,4})$/.exec(url)?.[1] ?? '');
    const ms = asNumber(r['duration']);
    hits.push({
      source: 'openverse',
      id: asString(r['id']) || url,
      title: decodeEntities(asString(r['title'])) || 'Tanpa judul',
      creator: decodeEntities(asString(r['creator'])),
      license,
      pageUrl: asString(r['foreign_landing_url']) || url,
      durationSec: ms === null ? null : Math.round(ms / 1000),
      size: asNumber(r['filesize']),
      year: null,
      downloadUrl: url,
      mime: MIME[type] ?? null,
    });
  }
  return {
    source: 'openverse',
    hits,
    hasMore: pages !== null ? page < pages : results.length >= pageSize,
  };
}
