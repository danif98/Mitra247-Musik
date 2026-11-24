/** Music already on the phone (Android MediaStore), played without copying it into the library. */
import { listFolder, matchesQuery, parentFolder } from '@musik/core';
import { id } from '@musik/ui';
import {
  native,
  nativeErrorCode,
  nativeFileUrl,
  type NativeSong,
  type NativeVolume,
} from './native';
import type { LazyTrack, Player } from './player.svelte';

export class DeviceMusic {
  songs = $state<NativeSong[]>([]);
  volumes = $state<NativeVolume[]>([]);
  /** Folder browser: view mode and the place in the tree (volume null = storage chooser). */
  mode = $state<'folders' | 'all'>('folders');
  volume = $state<string | null>(null);
  path = $state('');
  loaded = $state(false);
  /** Entries Android still lists although the file is gone (hidden from the list). */
  hidden = $state(0);
  loading = $state(false);
  opening = $state('');
  error = $state('');
  query = $state('');

  get visible(): NativeSong[] {
    const q = this.query.trim();
    if (!q) return this.songs;
    return this.songs.filter((s) =>
      matchesQuery({ title: s.title, fileName: `${s.artist} ${s.album} ${s.name}` }, q),
    );
  }

  /** Readable name of a storage volume. */
  volumeLabel(volumeId: string): string {
    const v = this.volumes.find((x) => x.id === volumeId);
    if (v) return v.label;
    return volumeId === 'external_primary'
      ? id.device.internal
      : `${id.device.external} (${volumeId})`;
  }

  get listing() {
    return listFolder(this.songs, this.volume, this.path);
  }

  /** Breadcrumb segments of the current place, each with the path that opens it. */
  get crumbs(): { name: string; path: string }[] {
    const parts = this.path.split('/').filter(Boolean);
    return parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join('/') }));
  }

  openVolume(volume: string): void {
    this.volume = volume;
    this.path = '';
  }

  openFolder(path: string): void {
    this.path = path;
  }

  /** One level up; from a volume root back to the storage chooser. */
  up(): void {
    if (this.volume === null) return;
    if (this.path === '') this.volume = null;
    else this.path = parentFolder(this.path);
  }

  /** After a refresh: leave a folder (or storage) that has no songs any more. */
  private fixPlace(): void {
    for (let i = 0; i < 32 && this.volume !== null; i++) {
      const l = listFolder(this.songs, this.volume, this.path);
      if (
        this.path === ''
          ? this.songs.some((s) => s.volume === this.volume)
          : l.folders.length + l.songs.length > 0
      ) {
        return;
      }
      this.up();
    }
  }

  /** Ask for the audio permission if needed, then read the list (also used to refresh it). */
  async load(): Promise<void> {
    if (!native || this.loading) return;
    this.loading = true;
    this.error = '';
    try {
      const perm = await native.requestAudioPermission();
      if (!perm.granted) {
        this.error = id.device.permissionDenied;
        return;
      }
      const list = await native.listAudio();
      this.songs = list.songs;
      this.volumes = list.volumes ?? [];
      this.hidden = list.hidden ?? 0;
      // A single storage with music: skip the chooser.
      const first = list.songs[0]?.volume;
      if (
        this.volume === null &&
        first !== undefined &&
        list.songs.every((x) => x.volume === first)
      ) {
        this.volume = first;
      }
      this.fixPlace();
      this.loaded = true;
    } catch (err) {
      this.error =
        nativeErrorCode(err) === 'permission' ? id.device.permissionDenied : id.device.failed;
    } finally {
      this.loading = false;
    }
  }

  /** Songs shown right now: the folder being browsed, or the (filtered) full list. */
  get shown(): NativeSong[] {
    return this.mode === 'all' ? this.visible : this.listing.songs;
  }

  /**
   * Play the tapped song and queue everything shown with it, so next/previous follow the folder
   * (or the search result). Files are read from MediaStore only when their turn comes.
   */
  async play(song: NativeSong, player: Player): Promise<boolean> {
    if (this.opening) return false;
    this.opening = song.id;
    this.error = '';
    try {
      const list = this.shown;
      const start = Math.max(
        0,
        list.findIndex((s) => s.id === song.id),
      );
      return await player.playLazy(list.map(toTrack), start);
    } catch {
      this.error = id.device.openFailed;
      void this.load();
      return false;
    } finally {
      this.opening = '';
    }
  }
}

/** Reads a MediaStore song through the WebView (file:// and content:// are served by Capacitor). */
function toTrack(song: NativeSong): LazyTrack {
  return {
    title: song.title,
    fileName: song.name || `${song.title}.mp3`,
    size: song.size,
    duration: song.durationMs / 1000,
    mime: song.mime,
    open: async () => {
      const res = await fetch(nativeFileUrl(song.uri));
      if (!res.ok) throw new Error('read');
      const blob = await res.blob();
      return new File([blob], song.name || `${song.title}.mp3`, {
        type: song.mime || blob.type || 'audio/mpeg',
      });
    },
  };
}
