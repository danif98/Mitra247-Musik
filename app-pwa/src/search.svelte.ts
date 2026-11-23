/** Search and download from legal sources (Creative Commons / public domain), browser to source. */
import {
  ALL_SOURCES,
  SourceError,
  archiveTracks,
  creditOf,
  downloadAudio,
  fileNameFor,
  searchSources,
  type SearchHit,
  type SongMeta,
  type SourceId,
  type SourceTrack,
} from '@musik/core';
import { id } from '@musik/ui';
import type { Player } from './player.svelte';

export interface Group {
  source: SourceId;
  hits: SearchHit[];
  hasMore: boolean;
  page: number;
  error: string;
  loadingMore: boolean;
}

export interface Expansion {
  loading: boolean;
  tracks: SourceTrack[];
  error: string;
}

export interface Download {
  phase: 'downloading' | 'saving' | 'done' | 'error';
  received: number;
  total: number | null;
  error: string;
  song: SongMeta | null;
}

const errorTexts = id.search.errors as Record<string, string>;
const searchErrorTexts = id.search.searchErrors as Record<string, string>;

export function describeSourceError(
  err: unknown,
  kind: 'search' | 'download' = 'download',
): string {
  const texts = kind === 'search' ? searchErrorTexts : errorTexts;
  if (err instanceof SourceError) return texts[err.code] ?? texts['network']!;
  return texts['network']!;
}

/** Stable key of a result or track. */
export const keyOf = (item: { source: SourceId; id: string }): string =>
  `${item.source}:${item.id}`;

const doFetch = (input: string, init?: RequestInit) => fetch(input, init);

export class SearchFlow {
  query = $state('');
  sources = $state<SourceId[]>([...ALL_SOURCES]);
  status = $state<'idle' | 'searching' | 'done'>('idle');
  groups = $state<Group[]>([]);
  expanded = $state<Record<string, Expansion>>({});
  downloads = $state<Record<string, Download>>({});
  private abort: AbortController | null = null;

  toggleSource(source: SourceId): void {
    const has = this.sources.includes(source);
    // At least one source stays selected.
    if (has && this.sources.length === 1) return;
    this.sources = has ? this.sources.filter((s) => s !== source) : [...this.sources, source];
  }

  async search(): Promise<void> {
    const q = this.query.trim();
    if (!q || this.status === 'searching') return;
    this.abort?.abort();
    this.abort = new AbortController();
    this.status = 'searching';
    this.groups = [];
    this.expanded = {};
    const results = await searchSources(q, this.sources, 1, doFetch, this.abort.signal);
    this.groups = results.map((r) => ({
      source: r.source,
      hits: r.page?.hits ?? [],
      hasMore: r.page?.hasMore ?? false,
      page: 1,
      error: r.error ? describeSourceError(r.error, 'search') : '',
      loadingMore: false,
    }));
    this.status = 'done';
  }

  async more(source: SourceId): Promise<void> {
    const group = this.groups.find((g) => g.source === source);
    if (!group || group.loadingMore || !group.hasMore) return;
    group.loadingMore = true;
    const [r] = await searchSources(this.query.trim(), [source], group.page + 1, doFetch);
    if (r?.page) {
      const seen = group.hits.map(keyOf);
      group.hits.push(...r.page.hits.filter((h) => !seen.includes(keyOf(h))));
      group.hasMore = r.page.hasMore;
      group.page += 1;
    } else {
      group.error = r?.error ? describeSourceError(r.error, 'search') : '';
    }
    group.loadingMore = false;
  }

  /** Album (Internet Archive item): list its files. */
  async expand(hit: SearchHit): Promise<void> {
    const key = keyOf(hit);
    if (this.expanded[key]) {
      delete this.expanded[key];
      return;
    }
    this.expanded[key] = { loading: true, tracks: [], error: '' };
    try {
      const tracks = await archiveTracks(hit, doFetch);
      this.expanded[key] = { loading: false, tracks, error: '' };
    } catch (err) {
      this.expanded[key] = {
        loading: false,
        tracks: [],
        error: describeSourceError(err, 'search'),
      };
    }
  }

  async download(item: SearchHit & { downloadUrl: string }, player: Player): Promise<void> {
    const key = keyOf(item);
    const current = this.downloads[key];
    if (current && (current.phase === 'downloading' || current.phase === 'saving')) return;
    this.downloads[key] = {
      phase: 'downloading',
      received: 0,
      total: item.size,
      error: '',
      song: null,
    };
    try {
      const { blob, mime } = await downloadAudio(item.downloadUrl, {
        fetch: doFetch,
        fallbackMime: item.mime,
        onProgress: (received, total) => {
          const d = this.downloads[key];
          if (d) {
            d.received = received;
            d.total = total ?? d.total;
          }
        },
      });
      this.downloads[key]!.phase = 'saving';
      let song: SongMeta;
      try {
        song = await player.store.add(
          new File([blob], fileNameFor(item.title, mime), { type: mime }),
          'web',
          { title: item.title, credit: creditOf(item) },
        );
      } catch {
        this.downloads[key] = {
          ...this.downloads[key]!,
          phase: 'error',
          error: errorTexts['save']!,
        };
        return;
      }
      await player.refresh();
      this.downloads[key] = { ...this.downloads[key]!, phase: 'done', song };
    } catch (err) {
      this.downloads[key] = {
        ...this.downloads[key]!,
        phase: 'error',
        error: describeSourceError(err),
      };
    }
  }
}
