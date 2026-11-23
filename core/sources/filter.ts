/**
 * Source APIs match loosely (any word, similar words). In Judul / Artis mode only hits whose title /
 * artist really contain every word of the query are kept. Pure, unit-tested.
 */
import type { SearchHit, SearchMode } from './types';

/** Lower case, no accents: "Beyoncé" matches "beyonce". */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function queryWords(query: string): string[] {
  return fold(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

export function matchesMode(
  hit: Pick<SearchHit, 'title' | 'creator'>,
  query: string,
  mode: SearchMode,
): boolean {
  if (mode === 'all') return true;
  const words = queryWords(query);
  const hay = fold(mode === 'title' ? hit.title : hit.creator);
  return words.every((w) => hay.includes(w));
}
