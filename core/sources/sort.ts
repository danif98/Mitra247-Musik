/** Merge the results of several sources into one list and sort it. Pure, unit-tested. */
import type { SearchHit } from './types';

export type SortKey = 'relevance' | 'artist' | 'title' | 'size' | 'year';
export type SortDir = 'asc' | 'desc';

export const SORT_KEYS: SortKey[] = ['relevance', 'artist', 'title', 'size', 'year'];

/** Direction that makes sense first: A-Z for text, biggest / newest first for numbers. */
export function defaultDir(key: SortKey): SortDir {
  return key === 'size' || key === 'year' ? 'desc' : 'asc';
}

const text = (a: string, b: string): number => a.localeCompare(b, 'id', { sensitivity: 'base' });

/** Unknown values (empty text, null number) always go last, whatever the direction. */
function compare(a: SearchHit, b: SearchHit, key: SortKey, dir: SortDir): number {
  const sign = dir === 'asc' ? 1 : -1;
  if (key === 'artist' || key === 'title') {
    const x = (key === 'artist' ? a.creator : a.title).trim();
    const y = (key === 'artist' ? b.creator : b.title).trim();
    if (!x && !y) return 0;
    if (!x) return 1;
    if (!y) return -1;
    return sign * text(x, y);
  }
  const x = key === 'size' ? a.size : a.year;
  const y = key === 'size' ? b.size : b.year;
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return sign * (x - y);
}

/** Round-robin over the sources keeps the relevance order of each one. */
function interleave(lists: SearchHit[][]): SearchHit[] {
  const out: SearchHit[] = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      const hit = list[i];
      if (hit) out.push(hit);
    }
  }
  return out;
}

export function mergeHits(
  groups: { hits: SearchHit[] }[],
  key: SortKey,
  dir: SortDir,
): SearchHit[] {
  const merged = interleave(groups.map((g) => g.hits));
  if (key === 'relevance') return merged;
  // Array.prototype.sort is stable: equal items keep their relevance order.
  return merged.sort(
    (a, b) => compare(a, b, key, dir) || (key === 'title' ? 0 : text(a.title, b.title)),
  );
}
