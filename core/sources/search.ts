import { searchArchive } from './archive';
import { searchCommons } from './commons';
import { matchesMode } from './filter';
import { searchOpenverse } from './openverse';
import {
  SourceError,
  type FetchLike,
  type SearchMode,
  type SearchPage,
  type SourceId,
} from './types';

export const ALL_SOURCES: SourceId[] = ['archive', 'openverse', 'commons'];
export const PAGE_SIZE = 15;

export interface SourceResult {
  source: SourceId;
  page: SearchPage | null;
  error: SourceError | null;
}

const IMPL = {
  archive: searchArchive,
  openverse: searchOpenverse,
  commons: searchCommons,
} as const;

/** Search the chosen sources in parallel; one failing source never hides the others. */
export async function searchSources(
  query: string,
  mode: SearchMode,
  sources: SourceId[],
  page: number,
  fetchFn: FetchLike,
  signal?: AbortSignal,
): Promise<SourceResult[]> {
  return Promise.all(
    sources.map(async (source): Promise<SourceResult> => {
      try {
        const result = await IMPL[source](query, mode, page, PAGE_SIZE, fetchFn, signal);
        const hits = result.hits.filter((h) => matchesMode(h, query, mode));
        return { source, page: { ...result, hits }, error: null };
      } catch (err) {
        return {
          source,
          page: null,
          error: err instanceof SourceError ? err : new SourceError('network', String(err)),
        };
      }
    }),
  );
}
