/**
 * Bridge to the Android wrapper (app-android, Capacitor). In a normal browser `native` is null and
 * the app behaves exactly as the plain PWA. Only `@capacitor/core` (small, no native code) is
 * bundled; the plugin itself lives in app-android.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { YoutubeSearchResult } from '@musik/core';

export interface NativeSong {
  id: string;
  /** content:// URI in MediaStore. */
  uri: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  size: number;
  year: number;
  mime: string;
  name: string;
  /** Storage volume id: "external_primary" = internal storage, others = SD card / USB. */
  volume: string;
  /** Folder below the volume root, e.g. "Music/Pop". */
  folder: string;
}

export interface NativeVolume {
  id: string;
  label: string;
  removable: boolean;
}

export interface SaveFolder {
  /** Tree URI of the chosen folder; empty when none is set (or it is gone). */
  uri: string;
  /** Readable path, e.g. "Penyimpanan internal / Music/Musik". */
  label: string;
  writable: boolean;
}

export interface NativeDownload {
  videoId: string;
  /** Absolute path of the temporary MP3 in the app cache. */
  path: string;
  title: string;
  duration: number;
  size: number;
  /** Set when a save folder is chosen and the MP3 was copied there. */
  savedUri?: string;
  savedName?: string;
  savedFolder?: string;
  /** A save folder is set but the copy failed (folder gone, read-only, ...). */
  saveError?: boolean;
}

export type MediaAction = 'play' | 'pause' | 'next' | 'prev' | 'stop' | 'seek';

export interface NowPlaying {
  title: string;
  artist: string;
  durationMs: number;
  positionMs: number;
  playing: boolean;
  speed: number;
  hasPrev: boolean;
  hasNext: boolean;
}

export interface ListenerHandle {
  remove: () => Promise<void>;
}

export interface MusikNative {
  audioPermission(): Promise<{ granted: boolean }>;
  requestAudioPermission(): Promise<{ granted: boolean }>;
  requestNotificationPermission(): Promise<{ granted: boolean }>;
  listAudio(): Promise<{ songs: NativeSong[]; volumes: NativeVolume[]; hidden?: number }>;
  pickSaveFolder(): Promise<SaveFolder>;
  getSaveFolder(): Promise<SaveFolder>;
  clearSaveFolder(): Promise<SaveFolder>;
  setNowPlaying(state: NowPlaying): Promise<void>;
  clearNowPlaying(): Promise<void>;
  ytVersion(): Promise<{ version: string }>;
  ytUpdate(): Promise<{ status: string; version: string }>;
  ytAutoUpdate(): Promise<{ enabled: boolean; lastCheck: number }>;
  setYtAutoUpdate(opts: { enabled: boolean }): Promise<{ enabled: boolean; lastCheck: number }>;
  ytSearch(opts: { query: string }): Promise<{ results: YoutubeSearchResult[] }>;
  ytDownload(opts: { videoId: string }): Promise<NativeDownload>;
  ytCancel(opts: { videoId: string }): Promise<void>;
  ytCleanup(opts: { videoId: string }): Promise<void>;
  getSharedText(): Promise<{ text: string }>;
  addListener(
    event: 'mediaAction',
    cb: (e: { action: MediaAction; positionMs?: number }) => void,
  ): Promise<ListenerHandle>;
  addListener(
    event: 'ytUpdate',
    cb: (e: { state: 'updating' | 'updated' | 'uptodate' | 'failed'; version?: string }) => void,
  ): Promise<ListenerHandle>;
  addListener(event: 'sharedText', cb: (e: { text: string }) => void): Promise<ListenerHandle>;
  addListener(
    event: 'ytProgress',
    cb: (e: { videoId: string; percent: number; stage: 'download' | 'convert' }) => void,
  ): Promise<ListenerHandle>;
}

/** The native plugin, or null when running as a plain PWA in a browser. */
export const native: MusikNative | null = Capacitor.isNativePlatform()
  ? registerPlugin<MusikNative>('MusikNative')
  : null;

/** URL the WebView can fetch for a content:// URI or an absolute file path. */
export function nativeFileUrl(uriOrPath: string): string {
  return Capacitor.convertFileSrc(
    uriOrPath.startsWith('content://') ? uriOrPath : `file://${uriOrPath}`,
  );
}

/** Plugin errors carry a short `code` (permission, blocked, unavailable, too_long, ...). */
export function nativeErrorCode(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : 'failed';
}
