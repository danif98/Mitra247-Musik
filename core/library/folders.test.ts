import { describe, expect, it } from 'vitest';
import { listFolder, normalizeFolder, parentFolder, type FolderSong } from './folders';

const s = (volume: string, folder: string, title: string): FolderSong & { title: string } => ({
  volume,
  folder,
  title,
});
const songs = [
  s('external_primary', 'Music/Pop', 'a'),
  s('external_primary', 'Music/Pop/Live', 'b'),
  s('external_primary', 'Music/Pop/Live', 'c'),
  s('external_primary', 'Music/Rock', 'd'),
  s('external_primary', 'Download', 'e'),
  s('external_primary', '', 'root-song'),
  s('1234-abcd', 'Lagu/Jazz', 'f'),
  s('1234-abcd', 'Lagu 10', 'g'),
  s('1234-abcd', 'Lagu 2', 'h'),
];

describe('normalizeFolder / parentFolder', () => {
  it('cleans slashes and finds the parent', () => {
    expect(normalizeFolder('/Music//Pop/')).toBe('Music/Pop');
    expect(normalizeFolder('/')).toBe('');
    expect(parentFolder('Music/Pop/Live')).toBe('Music/Pop');
    expect(parentFolder('Music')).toBe('');
    expect(parentFolder('')).toBe('');
  });
});

describe('listFolder', () => {
  it('lists storages with music, internal first', () => {
    const r = listFolder(songs, null, '');
    expect(r.volumes).toEqual([
      { volume: 'external_primary', count: 6 },
      { volume: '1234-abcd', count: 3 },
    ]);
    expect(r.songs).toEqual([]);
  });

  it('lists the volume root: its direct songs and top-level folders with recursive counts', () => {
    const r = listFolder(songs, 'external_primary', '');
    expect(r.folders).toEqual([
      { name: 'Download', path: 'Download', count: 1 },
      { name: 'Music', path: 'Music', count: 4 },
    ]);
    expect(r.songs.map((x) => (x as { title: string }).title)).toEqual(['root-song']);
  });

  it('descends into folders and separates direct songs from subfolders', () => {
    const r = listFolder(songs, 'external_primary', 'Music/Pop');
    expect(r.folders).toEqual([{ name: 'Live', path: 'Music/Pop/Live', count: 2 }]);
    expect(r.songs.map((x) => (x as { title: string }).title)).toEqual(['a']);
  });

  it('does not mix a folder with a sibling that shares its name prefix', () => {
    const r = listFolder(
      [s('v', 'Music', 'x'), s('v', 'Music2', 'y'), s('v', 'Music2/Sub', 'z')],
      'v',
      'Music',
    );
    expect(r.songs.map((x) => (x as { title: string }).title)).toEqual(['x']);
    expect(r.folders).toEqual([]);
  });

  it('keeps volumes apart and sorts folder names naturally', () => {
    const r = listFolder(songs, '1234-abcd', '');
    expect(r.folders.map((f) => f.name)).toEqual(['Lagu', 'Lagu 2', 'Lagu 10']);
    expect(listFolder(songs, '1234-abcd', 'Music').songs).toEqual([]);
  });

  it('accepts unnormalised paths', () => {
    expect(listFolder(songs, 'external_primary', '/Music/Rock/').songs).toHaveLength(1);
  });
});
