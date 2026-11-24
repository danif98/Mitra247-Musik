import { describe, expect, it } from 'vitest';
import {
  limitTracks,
  parseLastPosition,
  parseLastQueue,
  serializeLastQueue,
  type LastQueue,
  type LastTrack,
} from './lastplayed';

const track = (n: number): LastTrack => ({
  uri: `content://media/external/audio/media/${n}`,
  title: `T${n}`,
  artist: '',
  fileName: `t${n}.mp3`,
  size: 1,
  duration: 10,
  mime: 'audio/mpeg',
});

describe('parseLastQueue', () => {
  it('round-trips a library queue', () => {
    const q: LastQueue = {
      v: 1,
      source: 'library',
      label: 'Library',
      index: 1,
      ids: ['a', 'b', 'c'],
    };
    expect(parseLastQueue(serializeLastQueue(q))).toEqual(q);
  });
  it('round-trips a device queue', () => {
    const q: LastQueue = {
      v: 1,
      source: 'device',
      label: 'Musik di HP · Music/Pop',
      index: 0,
      tracks: [track(1), track(2)],
    };
    expect(parseLastQueue(serializeLastQueue(q))).toEqual(q);
  });
  it('rejects empty, malformed and unknown data', () => {
    expect(parseLastQueue(null)).toBeNull();
    expect(parseLastQueue('')).toBeNull();
    expect(parseLastQueue('{bad')).toBeNull();
    expect(parseLastQueue('[]')).toBeNull();
    expect(parseLastQueue(JSON.stringify({ v: 2, source: 'library', ids: ['a'] }))).toBeNull();
    expect(parseLastQueue(JSON.stringify({ v: 1, source: 'library', ids: [] }))).toBeNull();
    expect(parseLastQueue(JSON.stringify({ v: 1, source: 'cloud', ids: ['a'] }))).toBeNull();
  });
  it('keeps the index inside the list and drops unusable device tracks', () => {
    const raw = JSON.stringify({
      v: 1,
      source: 'device',
      label: 'x',
      index: 99,
      tracks: [track(1), { uri: 'file:///etc/passwd', title: 'x' }, 'x', track(3)],
    });
    const q = parseLastQueue(raw)!;
    expect(q.tracks!.map((t) => t.title)).toEqual(['T1', 'T3']);
    expect(q.index).toBe(1);
  });
  it('fills defaults for missing track fields and caps long text', () => {
    const q = parseLastQueue(
      JSON.stringify({
        v: 1,
        source: 'device',
        index: 0,
        tracks: [{ uri: 'content://x/1', title: 'a'.repeat(1000) }],
      }),
    )!;
    expect(q.tracks![0]!.title.length).toBe(300);
    expect(q.tracks![0]!.mime).toBe('audio/mpeg');
    expect(q.label).toBe('');
  });
});

describe('limitTracks', () => {
  const list = Array.from({ length: 10 }, (_, i) => track(i));
  it('leaves short lists alone', () => {
    expect(limitTracks(list, 4, 20)).toEqual({ tracks: list, index: 4 });
  });
  it('keeps a window that contains the playing track', () => {
    const r = limitTracks(list, 8, 4);
    expect(r.tracks).toHaveLength(4);
    expect(r.tracks[r.index]!.title).toBe('T8');
    const first = limitTracks(list, 0, 4);
    expect(first.tracks[first.index]!.title).toBe('T0');
  });
});

describe('parseLastPosition', () => {
  it('reads a position and rejects bad data', () => {
    expect(parseLastPosition(JSON.stringify({ key: 'a', position: 12.5 }))).toEqual({
      key: 'a',
      position: 12.5,
    });
    expect(parseLastPosition(JSON.stringify({ key: '', position: 1 }))).toBeNull();
    expect(parseLastPosition('x')).toBeNull();
    expect(parseLastPosition(null)).toBeNull();
    expect(parseLastPosition(JSON.stringify({ key: 'a', position: -5 }))!.position).toBe(0);
  });
});
