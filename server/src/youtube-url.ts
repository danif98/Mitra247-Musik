/**
 * Strict YouTube URL validation (SSRF / open-proxy protection).
 *
 * Only the video id is trusted. The URL handed to yt-dlp is rebuilt from that id as
 * https://www.youtube.com/watch?v=<id>, so no user-controlled host, path, query or credentials ever
 * reach the downloader. Playlists, channels and any other host are rejected.
 */

const HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
]);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
/** Paths of the form /<prefix>/<id> that denote a single video. */
const ID_PREFIXES = new Set(['shorts', 'embed', 'live', 'v']);
const MAX_LENGTH = 300;

export type UrlRejection = 'invalid' | 'scheme' | 'host' | 'playlist' | 'no_video';

export type ParsedUrl =
  { ok: true; videoId: string; url: string } | { ok: false; reason: UrlRejection };

export function canonicalUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** True for control characters, DEL and any whitespace (checked by code point, no regex). */
function containsControlOrSpace(text: string): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c <= 0x20 || c === 0x7f || ch.trim() === '') return true;
  }
  return false;
}

export function parseYoutubeUrl(input: unknown): ParsedUrl {
  if (typeof input !== 'string') return { ok: false, reason: 'invalid' };
  const text = input.trim();
  const hasControlOrSpace = containsControlOrSpace(text);
  if (text.length === 0 || text.length > MAX_LENGTH || hasControlOrSpace) {
    return { ok: false, reason: 'invalid' };
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, reason: 'scheme' };
  if (url.username || url.password) return { ok: false, reason: 'invalid' };
  if (url.port !== '') return { ok: false, reason: 'host' }; // default ports are dropped by URL
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!HOSTS.has(host)) return { ok: false, reason: 'host' };

  const segments = url.pathname.split('/').filter(Boolean);
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = segments[0] ?? null;
  } else if (segments[0] === 'watch') {
    id = url.searchParams.get('v');
  } else if (segments.length === 2 && ID_PREFIXES.has(segments[0]!)) {
    id = segments[1]!;
  } else if (segments[0] === 'playlist') {
    return { ok: false, reason: 'playlist' };
  }
  if (id === null) {
    return { ok: false, reason: url.searchParams.has('list') ? 'playlist' : 'no_video' };
  }
  if (!VIDEO_ID.test(id)) return { ok: false, reason: 'no_video' };
  return { ok: true, videoId: id, url: canonicalUrl(id) };
}
