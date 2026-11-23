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

/** Remove HTML tags and decode the few entities Wikimedia metadata uses. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
