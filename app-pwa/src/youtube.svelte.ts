/** YouTube to MP3 flow: create job, follow its status, fetch the MP3 and store it in the library. */
import { ApiError, type SongMeta } from '@musik/core';
import { id } from '@musik/ui';
import type { Player } from './player.svelte';
import type { ServerSettings } from './server.svelte';

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

export class YoutubeFlow {
  url = $state('');
  phase = $state<Phase>('idle');
  title = $state('');
  error = $state('');
  song = $state<SongMeta | null>(null);

  get active(): boolean {
    return ['queued', 'download', 'convert', 'saving'].includes(this.phase);
  }

  reset(): void {
    this.phase = 'idle';
    this.title = '';
    this.error = '';
    this.song = null;
  }

  /** Only one conversion at a time from the UI. */
  async start(server: ServerSettings, player: Player): Promise<void> {
    if (this.active) return;
    this.reset();
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

  private fail(message: string): void {
    this.error = message;
    this.phase = 'error';
  }
}
