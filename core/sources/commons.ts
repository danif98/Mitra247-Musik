/** Wikimedia Commons: audio files with their license metadata. */
import { asNumber, asString, getJson, isRecord, parseYear, stripHtml } from './http';
import { licenseFromShortName, licenseFromUrl } from './license';
import type { FetchLike, SearchHit, SearchMode, SearchPage } from './types';

function metaValue(meta: unknown, key: string): string {
  if (!isRecord(meta) || !isRecord(meta[key])) return '';
  return asString(meta[key]['value']);
}

export async function searchCommons(
  query: string,
  mode: SearchMode,
  page: number,
  pageSize: number,
  fetchFn: FetchLike,
  signal?: AbortSignal,
): Promise<SearchPage> {
  const q = query.replace(/\s+/g, ' ').trim();
  if (!q) return { source: 'commons', hits: [], hasMore: false };
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    // Title: every word must be in the file name. Artist has no search field: full text, then
    // filtered below on the Artist metadata.
    gsrsearch:
      mode === 'title'
        ? `${q
            .split(' ')
            .map((w) => `intitle:${w}`)
            .join(' ')} filetype:audio`
        : `${q} filetype:audio`,
    gsrnamespace: '6',
    gsrlimit: String(pageSize),
    gsroffset: String((page - 1) * pageSize),
    prop: 'imageinfo',
    iiprop: 'url|mime|size|extmetadata',
    iiextmetadatafilter: 'Artist|DateTimeOriginal|LicenseShortName|LicenseUrl',
    format: 'json',
    formatversion: '2',
    origin: '*',
  });
  const json = await getJson(
    fetchFn,
    `https://commons.wikimedia.org/w/api.php?${params.toString()}`,
    signal,
  );
  const queryPart = isRecord(json) ? json['query'] : null;
  const pages = isRecord(queryPart) && Array.isArray(queryPart['pages']) ? queryPart['pages'] : [];
  const more = isRecord(json) && isRecord(json['continue']);
  const hits: SearchHit[] = [];
  for (const p of pages) {
    if (!isRecord(p) || !Array.isArray(p['imageinfo']) || !isRecord(p['imageinfo'][0])) continue;
    const info = p['imageinfo'][0];
    const url = asString(info['url']).split('?')[0] ?? '';
    const mime = asString(info['mime']);
    if (!/^https:\/\//i.test(url) || !/^(audio\/|application\/ogg|video\/ogg)/i.test(mime)) {
      continue;
    }
    const meta = info['extmetadata'];
    const license =
      licenseFromUrl(metaValue(meta, 'LicenseUrl')) ??
      licenseFromShortName(metaValue(meta, 'LicenseShortName'));
    if (!license) continue;
    const creator = stripHtml(metaValue(meta, 'Artist'));
    if (mode === 'artist') {
      const hay = creator.toLowerCase();
      if (
        !q
          .toLowerCase()
          .split(' ')
          .every((w) => hay.includes(w))
      )
        continue;
    }
    const fileTitle = asString(p['title']);
    const title = fileTitle.replace(/^File:/i, '').replace(/\.[A-Za-z0-9]{2,4}$/, '');
    hits.push({
      source: 'commons',
      id: fileTitle || url,
      title: title || 'Tanpa judul',
      creator,
      license,
      pageUrl:
        asString(info['descriptionurl']) ||
        `https://commons.wikimedia.org/wiki/${encodeURIComponent(fileTitle)}`,
      durationSec: null,
      size: asNumber(info['size']),
      year: parseYear(metaValue(meta, 'DateTimeOriginal')),
      downloadUrl: url,
      mime: /ogg/i.test(mime) ? 'audio/ogg' : mime,
    });
  }
  return { source: 'commons', hits, hasMore: more };
}
