/**
 * YouTube to MP3: keyword search (newest first, loaded page by page), a preview, and a convert
 * queue. The queue runs one video at a time with a random 5-10 second pause between videos, so
 * the app never hammers YouTube. Each video: create job, follow its status, fetch the MP3 and
 * store it in the library (on the phone: yt-dlp runs inside the app).
 */
import {
  ApiError,
  parseYoutubeVideoId,
  simplifyTitle,
  type SongMeta,
  type YoutubeSearchResult,
} from '@musik/core';
import { id } from '@musik/ui';
import type { Player } from './player.svelte';
import type { ServerSettings } from './server.svelte';
import { native, nativeErrorCode, nativeFileUrl, readNativeFile } from './native';
import { saveFolder } from './save-folder.svelte';

export type Phase = 'idle' | 'queued' | 'download' | 'convert' | 'saving' | 'done' | 'error';

type ErrorTexts = Record<string, string>;

/** Pause between two queued conversions. */
export const MIN_GAP_MS = 5000;
export const MAX_GAP_MS = 10000;

/** Random pause in [MIN_GAP_MS, MAX_GAP_MS], whole seconds. */
export function randomGapMs(rand: () => number = Math.random): number {
  const seconds = Math.round(MIN_GAP_MS / 1000 + rand() * ((MAX_GAP_MS - MIN_GAP_MS) / 1000));
  return Math.max(MIN_GAP_MS, Math.min(MAX_GAP_MS, seconds * 1000));
}

export function describeError(err: unknown): string {
  const texts = id.youtube.errors as ErrorTexts;
  if (err instanceof ApiError) {
    if (err.code === 'job_failed') {
      return texts[err.details.jobError ?? 'failed'] ?? texts['failed']!;
    }
    return texts[err.code] ?? texts['server']!;
  }
  return texts['server']!;
}

/** Error text for a failure reported by the native plugin (it only sends a short code). */
export function describeNativeError(err: unknown): string {
  const texts = id.youtube.errors as ErrorTexts;
  return texts[nativeErrorCode(err)] ?? texts['failed']!;
}

/** A search result with its shortened "Song - Artist" label. */
export interface FoundVideo extends YoutubeSearchResult {
  label: string;
}

export interface QueueItem {
  videoId: string;
  /** Shortened "Song - Artist" title (the video id until the real title is known). */
  title: string;
  status: 'waiting' | 'running' | 'done' | 'error';
  phase: Phase;
  error: string;
  song: SongMeta | null;
  /** Android: the MP3 copied to the chosen folder (and what happened to it). */
  savedUri: string;
  savedName: string;
  savedFolder: string;
  saveFailed: boolean;
  duration: number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class YoutubeFlow {
  /** Manual URL field. */
  url = $state('');
  urlError = $state('');

  // Search by keyword (yt-dlp ytsearchdate: newest uploads first), loaded page by page.
  query = $state('');
  results = $state<FoundVideo[]>([]);
  searching = $state(false);
  loadingMore = $state(false);
  searched = $state(false);
  hasMore = $state(false);
  searchError = $state('');
  private searchSeq = 0;
  private searchedQuery = '';
  private offset = 0;

  /** Video shown in the preview player (YouTube embed), or ''. */
  previewId = $state('');
  previewTitle = $state('');

  queue = $state<QueueItem[]>([]);
  /** Seconds left of the pause before the next queued video starts (0 = not pausing). */
  waitSec = $state(0);
  private pumping = false;
  /** Replaced in tests to run without real waiting. */
  gap: () => number = () => randomGapMs();
  pause: (ms: number) => Promise<void> = sleep;

  /** True while a conversion is running or the queue still has waiting items. */
  get busy(): boolean {
    return this.queue.some((q) => q.status === 'running' || q.status === 'waiting');
  }

  itemFor(videoId: string): QueueItem | undefined {
    return this.queue.find((q) => q.videoId === videoId);
  }

  // ---------- search ----------

  private async fetchPage(
    server: ServerSettings,
    q: string,
    offset: number,
  ): Promise<{ results: YoutubeSearchResult[]; hasMore: boolean }> {
    return native
      ? await native.ytSearch({ query: q, offset })
      : await server.client().search(q, offset);
  }

  private label(r: YoutubeSearchResult): FoundVideo {
    return { ...r, label: simplifyTitle(r.title, r.channel) };
  }

  /** New search from the first page. */
  async search(server: ServerSettings): Promise<void> {
    const q = this.query.trim();
    if (q === '' || this.searching) return;
    this.searchError = '';
    if (!native && !server.configured) {
      this.searchError = describeError(new ApiError('no_server', 'no server'));
      return;
    }
    const seq = ++this.searchSeq;
    this.searching = true;
    this.loadingMore = false;
    try {
      const page = await this.fetchPage(server, q, 0);
      if (seq !== this.searchSeq) return;
      this.results = page.results.map((r) => this.label(r));
      this.hasMore = page.hasMore;
      this.offset = 15;
      this.searchedQuery = q;
      this.searched = true;
    } catch (err) {
      if (seq !== this.searchSeq) return;
      this.results = [];
      this.hasMore = false;
      this.searched = false;
      this.searchError = native ? describeNativeError(err) : describeError(err);
    } finally {
      if (seq === this.searchSeq) this.searching = false;
    }
  }

  /** Next page of the current search (called by the scroll sentinel or the "more" button). */
  async loadMore(server: ServerSettings): Promise<void> {
    if (!this.searched || !this.hasMore || this.searching || this.loadingMore) return;
    const seq = this.searchSeq;
    const q = this.searchedQuery;
    this.loadingMore = true;
    this.searchError = '';
    try {
      const page = await this.fetchPage(server, q, this.offset);
      if (seq !== this.searchSeq) return;
      const known = new Set<string>(this.results.map((r) => r.videoId)); // eslint-disable-line svelte/prefer-svelte-reactivity
      this.results.push(
        ...page.results.filter((r) => !known.has(r.videoId)).map((r) => this.label(r)),
      );
      this.hasMore = page.hasMore;
      this.offset += 15;
    } catch (err) {
      if (seq !== this.searchSeq) return;
      // Keep what is shown; the "more" button stays so the user can retry.
      this.searchError = native ? describeNativeError(err) : describeError(err);
    } finally {
      if (seq === this.searchSeq) this.loadingMore = false;
    }
  }

  // ---------- preview ----------

  openPreview(r: FoundVideo, player: Player): void {
    player.pause();
    this.previewId = r.videoId;
    this.previewTitle = r.label;
  }

  closePreview(): void {
    this.previewId = '';
    this.previewTitle = '';
  }

  // ---------- queue ----------

  /** Add one video to the convert queue and start the queue if it is idle. */
  enqueue(videoId: string, title: string, server: ServerSettings, player: Player): void {
    const existing = this.itemFor(videoId);
    if (existing && existing.status !== 'error') return;
    if (existing) this.queue = this.queue.filter((q) => q !== existing);
    this.queue.push({
      videoId,
      title: title || videoId,
      status: 'waiting',
      phase: 'queued',
      error: '',
      song: null,
      savedUri: '',
      savedName: '',
      savedFolder: '',
      saveFailed: false,
      duration: 0,
    });
    void this.pump(server, player);
  }

  /** Manual URL: validate it and put it in the queue. */
  addUrl(server: ServerSettings, player: Player): void {
    const videoId = parseYoutubeVideoId(this.url);
    if (!videoId) {
      this.urlError = describeError(new ApiError('invalid_url', 'invalid url'));
      return;
    }
    if (!native && !server.configured) {
      this.urlError = describeError(new ApiError('no_server', 'no server'));
      return;
    }
    this.urlError = '';
    const known = this.results.find((r) => r.videoId === videoId);
    this.enqueue(videoId, known?.label ?? videoId, server, player);
    this.url = '';
  }

  /** Remove a waiting or finished item (a running one cannot be removed). */
  remove(videoId: string): void {
    const item = this.itemFor(videoId);
    if (item && item.status !== 'running') this.queue = this.queue.filter((q) => q !== item);
  }

  clearFinished(): void {
    this.queue = this.queue.filter((q) => q.status === 'waiting' || q.status === 'running');
  }

  /** One video at a time; after each one a random 5-10 s pause while more are waiting. */
  private async pump(server: ServerSettings, player: Player): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      let first = true;
      for (;;) {
        const next = this.queue.find((q) => q.status === 'waiting');
        if (!next) break;
        if (!first) await this.countdown(this.gap());
        // The item may have been removed during the pause.
        if (!this.queue.includes(next)) continue;
        first = false;
        next.status = 'running';
        await this.run(next, server, player);
      }
    } finally {
      this.pumping = false;
      this.waitSec = 0;
    }
  }

  private async countdown(ms: number): Promise<void> {
    // Nothing to wait for when every waiting item was removed.
    if (!this.queue.some((q) => q.status === 'waiting')) return;
    let left = Math.ceil(ms / 1000);
    while (left > 0) {
      this.waitSec = left;
      await this.pause(Math.min(1000, ms));
      left--;
    }
    this.waitSec = 0;
  }

  private async run(item: QueueItem, server: ServerSettings, player: Player): Promise<void> {
    item.phase = 'queued';
    try {
      if (native) await this.runNative(item, native, player);
      else await this.runServer(item, server, player);
      item.status = 'done';
      item.phase = 'done';
    } catch (err) {
      item.error =
        err instanceof ApiError
          ? describeError(err)
          : err instanceof SaveError
            ? id.youtube.errors.save
            : describeNativeError(err);
      item.status = 'error';
      item.phase = 'error';
    }
  }

  private async runServer(item: QueueItem, server: ServerSettings, player: Player): Promise<void> {
    if (!server.configured) throw new ApiError('no_server', 'no server');
    const api = server.client();
    const created = await api.createJob(`https://www.youtube.com/watch?v=${item.videoId}`);
    const done = await api.waitForJob(created.id, (job) => {
      if (job.status === 'running') item.phase = job.stage === 'convert' ? 'convert' : 'download';
      else if (job.status === 'queued') item.phase = 'queued';
    });
    item.phase = 'saving';
    const link = done.downloadUrl;
    if (!link) throw new ApiError('not_found', 'no link');
    const blob = await api.download(link);
    if (item.title === item.videoId) item.title = simplifyTitle(done.title ?? done.videoId);
    await this.store(item, blob, player);
  }

  /** On the phone: yt-dlp runs inside the app, so no server (and no server IP block) is involved. */
  private async runNative(
    item: QueueItem,
    plugin: NonNullable<typeof native>,
    player: Player,
  ): Promise<void> {
    const videoId = item.videoId;
    const progress = await plugin.addListener('ytProgress', (e) => {
      if (e.videoId !== videoId) return;
      item.phase = e.stage === 'convert' ? 'convert' : 'download';
    });
    try {
      item.phase = 'download';
      const done = await plugin.ytDownload({
        videoId,
        ...(item.title !== videoId ? { title: item.title } : {}),
      });
      if (item.title === videoId) item.title = simplifyTitle(done.title);
      item.phase = 'saving';
      item.saveFailed = done.saveError === true;
      if (done.savedUri) {
        item.savedUri = done.savedUri;
        item.savedName = done.savedName ?? '';
        item.savedFolder = done.savedFolder ?? '';
        item.duration = done.duration;
      }
      // The Library copy is kept when asked for, and always when nothing was saved in the folder.
      if (saveFolder.keepInLibrary || !done.savedUri) {
        try {
          const res = await fetch(nativeFileUrl(done.path));
          if (!res.ok) throw new ApiError('server', 'read failed');
          await this.store(item, await res.blob(), player);
        } finally {
          void plugin.ytCleanup({ videoId });
        }
      } else {
        void plugin.ytCleanup({ videoId });
      }
    } finally {
      void progress.remove();
    }
  }

  private async store(item: QueueItem, blob: Blob, player: Player): Promise<void> {
    const name = `${item.title.replace(/[\\/:*?"<>|]+/g, '_')}.mp3`;
    let song: SongMeta;
    try {
      song = await player.store.add(new File([blob], name, { type: 'audio/mpeg' }), 'youtube');
    } catch {
      throw new SaveError();
    }
    await player.refresh();
    item.song = song;
    item.title = song.title;
  }

  /** Open a finished item in the player. Returns false when there is nothing to play. */
  async play(item: QueueItem, player: Player): Promise<boolean> {
    if (item.song) {
      await player.select(item.song);
      return true;
    }
    if (!item.savedUri) return false;
    const uri = item.savedUri;
    const fileName = item.savedName || `${item.title}.mp3`;
    return player.playLazy(
      [
        {
          uri,
          title: item.title,
          fileName,
          size: 0,
          duration: item.duration,
          mime: 'audio/mpeg',
          open: () => readNativeFile(uri, fileName, 'audio/mpeg'),
        },
      ],
      0,
      item.savedFolder,
    );
  }
}

/** The MP3 was downloaded but the library refused it. */
class SaveError extends Error {}
