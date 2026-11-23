/** Pure helpers for the local library (no browser APIs, unit-tested). */
import type { SongCredit } from '../sources/types';

export interface SongMeta {
  id: string;
  title: string;
  fileName: string;
  size: number;
  /** Seconds; 0 when unknown. */
  duration: number;
  addedAt: number;
  source: 'local' | 'youtube' | 'web';
  mime: string;
  /** Waveform peaks (0..1), empty when not computed. */
  peaks: Float32Array;
  /** Author and license of a song downloaded from a legal source (source 'web'). */
  credit?: SongCredit;
}

export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac'];

/** "Duet - Selalu ada.m4a" -> "Duet - Selalu ada" (extension removed, underscores to spaces). */
export function titleFromFileName(fileName: string): string {
  const base = fileName
    .replace(/\.[A-Za-z0-9]{1,5}$/, '')
    .replace(/_+/g, ' ')
    .trim();
  return base || fileName;
}

export function isSupportedAudio(file: { name: string; type: string }): boolean {
  if (file.type.startsWith('audio/')) return true;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return AUDIO_EXTENSIONS.includes(ext);
}

/** "3:05" or "1:02:03"; unknown (0 / NaN) -> "–". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '–';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** Case-insensitive, all words must match title or file name. */
export function matchesQuery(song: Pick<SongMeta, 'title' | 'fileName'>, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = `${song.title} ${song.fileName}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** Newest first. */
export function sortSongs<T extends Pick<SongMeta, 'addedAt' | 'title'>>(songs: T[]): T[] {
  return [...songs].sort((a, b) => b.addedAt - a.addedAt || a.title.localeCompare(b.title));
}
