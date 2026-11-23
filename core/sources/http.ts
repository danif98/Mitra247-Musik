import { SourceError, type FetchLike } from './types';

/** GET JSON; network failures and non-2xx answers become SourceError. */
export async function getJson(
  fetchFn: FetchLike,
  url: string,
  signal?: AbortSignal,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchFn(url, { signal, headers: { Accept: 'application/json' } });
  } catch (err) {
    if (signal?.aborted) throw new SourceError('aborted', 'aborted');
    throw new SourceError('network', err instanceof Error ? err.message : 'network');
  }
  if (!res.ok) throw new SourceError('http', `HTTP ${res.status}`, res.status);
  try {
    return await res.json();
  } catch {
    throw new SourceError('bad_response', 'invalid JSON');
  }
}

export function asString(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v)) return v.map(asString).filter(Boolean).join(', ');
  return '';
}

export function asNumber(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Decode the HTML entities that APIs leave in plain text (&amp;, &#x27;, &#39; ...). */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, h: string) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d{1,7});/g, (_, d: string) => safeChar(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function safeChar(code: number): string {
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
}

/** Remove HTML tags and decode entities (Wikimedia metadata is HTML). */
export function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/** First plausible year (1500-2100) in free text such as "circa 1935" or "2014-12-01T00:00:00Z". */
export function parseYear(v: unknown): number | null {
  const m = /(?:^|\D)(1[5-9]\d\d|20\d\d)(?!\d)/.exec(
    asString(typeof v === 'number' ? String(v) : v),
  );
  if (!m) return null;
  const year = Number(m[1]);
  return year <= new Date().getFullYear() + 1 ? year : null;
}
