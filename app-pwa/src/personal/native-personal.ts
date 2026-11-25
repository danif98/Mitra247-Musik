/**
 * Bridge to the personal-edition plugin of the Android app (`MusikPersonal`, app-android
 * src/personal). Only the personal build includes this file; `nativeP` is null in a browser.
 */
import { registerPlugin } from '@capacitor/core';
import type { YoutubeSearchResult } from '@musik/core';
import { native, type ListenerHandle } from '../native';

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

export interface MusikPersonal {
  pickSaveFolder(): Promise<SaveFolder>;
  getSaveFolder(): Promise<SaveFolder>;
  clearSaveFolder(): Promise<SaveFolder>;
  ytVersion(): Promise<{ version: string }>;
  ytUpdate(): Promise<{ status: string; version: string }>;
  ytAutoUpdate(): Promise<{ enabled: boolean; lastCheck: number }>;
  setYtAutoUpdate(opts: { enabled: boolean }): Promise<{ enabled: boolean; lastCheck: number }>;
  ytSearch(opts: {
    query: string;
    offset?: number;
  }): Promise<{ results: YoutubeSearchResult[]; hasMore: boolean }>;
  ytDownload(opts: { videoId: string; title?: string }): Promise<NativeDownload>;
  ytCancel(opts: { videoId: string }): Promise<void>;
  ytCleanup(opts: { videoId: string }): Promise<void>;
  getSharedText(): Promise<{ text: string }>;
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

export const nativeP: MusikPersonal | null = native
  ? registerPlugin<MusikPersonal>('MusikPersonal')
  : null;
