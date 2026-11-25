/**
 * Bridge to the Android wrapper (app-android, Capacitor). In a normal browser `native` is null and
 * the app behaves exactly as the plain PWA. Only `@capacitor/core` (small, no native code) is
 * bundled; the plugin itself lives in app-android.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

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

export interface AppInfo {
  versionName: string;
  versionCode: number;
  /** ms since epoch: when this APK was built. */
  buildTime: number;
  packageName: string;
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
  appInfo(): Promise<AppInfo>;
  audioPermission(): Promise<{ granted: boolean }>;
  requestAudioPermission(): Promise<{ granted: boolean }>;
  requestNotificationPermission(): Promise<{ granted: boolean }>;
  listAudio(): Promise<{ songs: NativeSong[]; volumes: NativeVolume[]; hidden?: number }>;
  setNowPlaying(state: NowPlaying): Promise<void>;
  clearNowPlaying(): Promise<void>;
  addListener(
    event: 'mediaAction',
    cb: (e: { action: MediaAction; positionMs?: number }) => void,
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

/** Read a content:// URI or file path through the WebView into a File. */
export async function readNativeFile(uri: string, name: string, mime: string): Promise<File> {
  const res = await fetch(nativeFileUrl(uri));
  if (!res.ok) throw new Error('read');
  const blob = await res.blob();
  return new File([blob], name, { type: mime || blob.type || 'audio/mpeg' });
}
