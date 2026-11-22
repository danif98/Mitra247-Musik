import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatDuration,
  isSupportedAudio,
  matchesQuery,
  sortSongs,
  titleFromFileName,
} from './meta';

describe('library meta helpers', () => {
  it('derives a title from the file name', () => {
    expect(titleFromFileName('Duet Selalu ada di nadimu.m4a')).toBe('Duet Selalu ada di nadimu');
    expect(titleFromFileName('my_song_v2.mp3')).toBe('my song v2');
    expect(titleFromFileName('.mp3')).toBe('.mp3');
    expect(titleFromFileName('noext')).toBe('noext');
  });
  it('detects supported audio by mime or extension', () => {
    expect(isSupportedAudio({ name: 'a.bin', type: 'audio/mpeg' })).toBe(true);
    expect(isSupportedAudio({ name: 'a.FLAC', type: '' })).toBe(true);
    expect(isSupportedAudio({ name: 'a.txt', type: 'text/plain' })).toBe(false);
  });
  it('formats durations and sizes', () => {
    expect(formatDuration(185.4)).toBe('3:05');
    expect(formatDuration(3723)).toBe('1:02:03');
    expect(formatDuration(0)).toBe('–');
    expect(formatDuration(Number.NaN)).toBe('–');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
  it('matches search queries on every word', () => {
    const song = { title: 'Selalu ada di nadimu', fileName: 'duet.m4a' };
    expect(matchesQuery(song, '')).toBe(true);
    expect(matchesQuery(song, 'NADIMU selalu')).toBe(true);
    expect(matchesQuery(song, 'duet')).toBe(true);
    expect(matchesQuery(song, 'lain')).toBe(false);
  });
  it('sorts newest first, then by title', () => {
    const sorted = sortSongs([
      { addedAt: 1, title: 'b' },
      { addedAt: 2, title: 'z' },
      { addedAt: 2, title: 'a' },
    ]);
    expect(sorted.map((s) => s.title)).toEqual(['a', 'z', 'b']);
  });
});
