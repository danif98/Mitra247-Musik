/** YouTube to MP3 flow: create job, follow its status, fetch the MP3 and store it in the library. */
import {
  ApiError,
  parseYoutubeVideoId,
  type SongMeta,
  type YoutubeSearchResult,
} from '@musik/core';
import { id } from '@musik/ui';
import type { Player } from './player.svelte';
import type { ServerSettings } from './server.svelte';
import { native, nativeErrorCode, nativeFileUrl } from './native';
import { saveFolder } from './save-folder.svelte';

export type Phase = 'idle' | 'queued' | 'download' | 'convert' | 'saving' | 'done' | 'error';

type ErrorTexts = Record<string, string>;

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

export class YoutubeFlow {
  url = $state('');
  phase = $state<Phase>('idle');
  title = $state('');
  error = $state('');
  song = $state<SongMeta | null>(null);
  /** Android: the MP3 copied to the chosen folder (and what happened to it). */
  savedUri = $state('');
  savedName = $state('');
  savedFolder = $state('');
  saveFailed = $state(false);
  private savedDuration = 0;

  // Search by keyword (server runs yt-dlp ytsearch).
  query = $state('');
  results = $state<YoutubeSearchResult[]>([]);
  searching = $state(false);
  searched = $state(false);
  searchError = $state('');
  private searchSeq = 0;

  get active(): boolean {
    return ['queued', 'download', 'convert', 'saving'].includes(this.phase);
  }

  reset(): void {
    this.phase = 'idle';
    this.title = '';
    this.error = '';
    this.song = null;
    this.savedUri = '';
    this.savedName = '';
    this.savedFolder = '';
    this.saveFailed = false;
  }

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
    try {
      const found = native
        ? (await native.ytSearch({ query: q })).results
        : await server.client().search(q);
      if (seq !== this.searchSeq) return;
      this.results = found;
      this.searched = true;
    } catch (err) {
      if (seq !== this.searchSeq) return;
      this.results = [];
      this.searched = false;
      this.searchError = native ? describeNativeError(err) : describeError(err);
    } finally {
      if (seq === this.searchSeq) this.searching = false;
    }
  }

  /** Only one conversion at a time from the UI. */
  async start(server: ServerSettings, player: Player): Promise<void> {
    if (this.active) return;
    this.reset();
    if (native) return this.startNative(native, player);
    if (!server.configured) {
      this.fail(describeError(new ApiError('no_server', 'no server')));
      return;
    }
    const api = server.client();
    try {
      this.phase = 'queued';
      const created = await api.createJob(this.url.trim());
      const done = await api.waitForJob(created.id, (job) => {
        if (job.title) this.title = job.title;
        if (job.status === 'running') this.phase = job.stage === 'convert' ? 'convert' : 'download';
        else if (job.status === 'queued') this.phase = 'queued';
      });
      this.phase = 'saving';
      const link = done.downloadUrl;
      if (!link) throw new ApiError('not_found', 'no link');
      const blob = await api.download(link);
      const name = `${(done.title ?? done.videoId).replace(/[\\/:*?"<>|]+/g, '_')}.mp3`;
      let song: SongMeta;
      try {
        song = await player.store.add(new File([blob], name, { type: 'audio/mpeg' }), 'youtube');
      } catch {
        this.fail(id.youtube.errors.save);
        return;
      }
      await player.refresh();
      this.song = song;
      this.title = song.title;
      this.phase = 'done';
    } catch (err) {
      this.fail(describeError(err));
    }
  }

  /** On the phone: yt-dlp runs inside the app, so no server (and no server IP block) is involved. */
  private async startNative(plugin: NonNullable<typeof native>, player: Player): Promise<void> {
    const videoId = parseYoutubeVideoId(this.url);
    if (!videoId) {
      this.fail(describeError(new ApiError('invalid_url', 'invalid url')));
      return;
    }
    this.phase = 'queued';
    const progress = await plugin.addListener('ytProgress', (e) => {
      if (e.videoId !== videoId) return;
      this.phase = e.stage === 'convert' ? 'convert' : 'download';
    });
    try {
      this.phase = 'download';
      const done = await plugin.ytDownload({ videoId });
      this.title = done.title;
      this.phase = 'saving';
      this.saveFailed = done.saveError === true;
      if (done.savedUri) {
        this.savedUri = done.savedUri;
        this.savedName = done.savedName ?? '';
        this.savedFolder = done.savedFolder ?? '';
        this.savedDuration = done.duration;
      }
      // The Library copy is kept when asked for, and always when nothing was saved in the folder.
      if (saveFolder.keepInLibrary || !done.savedUri) {
        const res = await fetch(nativeFileUrl(done.path));
        if (!res.ok) throw new ApiError('server', 'read failed');
        const blob = await res.blob();
        const name = `${done.title.replace(/[\\/:*?"<>|]+/g, '_')}.mp3`;
        let song: SongMeta;
        try {
          song = await player.store.add(new File([blob], name, { type: 'audio/mpeg' }), 'youtube');
        } catch {
          this.fail(id.youtube.errors.save);
          return;
        } finally {
          void plugin.ytCleanup({ videoId });
        }
        await player.refresh();
        this.song = song;
        this.title = song.title;
      } else {
        void plugin.ytCleanup({ videoId });
      }
      this.phase = 'done';
    } catch (err) {
      this.fail(err instanceof ApiError ? describeError(err) : describeNativeError(err));
    } finally {
      void progress.remove();
    }
  }

  /** Play the MP3 that was saved only in the chosen folder (not kept in the Library). */
  async playSaved(player: Player): Promise<boolean> {
    if (!this.savedUri) return false;
    const uri = this.savedUri;
    return player.playLazy(
      [
        {
          title: this.title,
          fileName: this.savedName || `${this.title}.mp3`,
          size: 0,
          duration: this.savedDuration,
          mime: 'audio/mpeg',
          open: async () => {
            const res = await fetch(nativeFileUrl(uri));
            if (!res.ok) throw new Error('read');
            return new File([await res.blob()], this.savedName || 'lagu.mp3', {
              type: 'audio/mpeg',
            });
          },
        },
      ],
      0,
    );
  }

  private fail(message: string): void {
    this.error = message;
    this.phase = 'error';
  }
}
