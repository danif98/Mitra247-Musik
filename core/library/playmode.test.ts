import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLAY_MODE,
  advance,
  hasNextTrack,
  hasPreviousTrack,
  nextRepeat,
  previous,
  reshuffle,
  sanitizePlayMode,
  sequentialOrder,
  shuffleOrder,
  type PlayMode,
} from './playmode';

const mode = (m: Partial<PlayMode> = {}): PlayMode => ({ ...DEFAULT_PLAY_MODE, ...m });

describe('play mode settings', () => {
  it('sanitizes stored values', () => {
    expect(sanitizePlayMode(null)).toEqual(DEFAULT_PLAY_MODE);
    expect(sanitizePlayMode({ autoNext: false, repeat: 'one', shuffle: true })).toEqual({
      autoNext: false,
      repeat: 'one',
      shuffle: true,
    });
    expect(sanitizePlayMode({ autoNext: 'no', repeat: 'x', shuffle: 1 })).toEqual(
      DEFAULT_PLAY_MODE,
    );
  });
  it('cycles repeat off -> all -> one -> off', () => {
    expect(nextRepeat('off')).toBe('all');
    expect(nextRepeat('all')).toBe('one');
    expect(nextRepeat('one')).toBe('off');
  });
});

describe('shuffle order', () => {
  it('is a permutation with the first track first', () => {
    const o = shuffleOrder(8, 3, () => 0.4);
    expect(o[0]).toBe(3);
    expect([...o].sort((a, b) => a - b)).toEqual(sequentialOrder(8));
  });
  it('is deterministic for a given random source and handles tiny lists', () => {
    expect(shuffleOrder(5, 0, () => 0)).toEqual(shuffleOrder(5, 0, () => 0));
    expect(shuffleOrder(0, 0)).toEqual([]);
    expect(shuffleOrder(1, 0)).toEqual([0]);
  });
  it('without a first track every index appears', () => {
    expect([...shuffleOrder(6, -1)].sort((a, b) => a - b)).toEqual(sequentialOrder(6));
  });
  it('reshuffle never starts with the track just played', () => {
    for (let i = 0; i < 50; i++) expect(reshuffle(4, 2)[0]).not.toBe(2);
    expect(reshuffle(1, 0)).toEqual([0]);
  });
});

describe('advance', () => {
  const order = sequentialOrder(3);
  it('goes to the next track in play order, also when shuffled', () => {
    expect(advance(order, 0, 'ended', mode())).toEqual({ kind: 'track', index: 1, wrapped: false });
    expect(advance([2, 0, 1], 2, 'manual', mode({ shuffle: true }))).toEqual({
      kind: 'track',
      index: 0,
      wrapped: false,
    });
  });
  it('stops after the last track unless repeating all', () => {
    expect(advance(order, 2, 'ended', mode())).toEqual({ kind: 'stop' });
    expect(advance(order, 2, 'manual', mode())).toEqual({ kind: 'stop' });
    expect(advance(order, 2, 'ended', mode({ repeat: 'all' }))).toEqual({
      kind: 'track',
      index: 0,
      wrapped: true,
    });
  });
  it('repeat one restarts the ended track, even with auto next off, but Next still moves on', () => {
    expect(advance(order, 1, 'ended', mode({ repeat: 'one' }))).toEqual({ kind: 'restart' });
    expect(advance(order, 1, 'ended', mode({ repeat: 'one', autoNext: false }))).toEqual({
      kind: 'restart',
    });
    expect(advance(order, 1, 'manual', mode({ repeat: 'one' }))).toEqual({
      kind: 'track',
      index: 2,
      wrapped: false,
    });
  });
  it('auto next off stops when a track ends but not on the Next button', () => {
    expect(advance(order, 0, 'ended', mode({ autoNext: false }))).toEqual({ kind: 'stop' });
    expect(advance(order, 0, 'manual', mode({ autoNext: false }))).toEqual({
      kind: 'track',
      index: 1,
      wrapped: false,
    });
  });
  it('stops for an unknown index', () => {
    expect(advance(order, 9, 'manual', mode())).toEqual({ kind: 'stop' });
    expect(advance([], 0, 'ended', mode())).toEqual({ kind: 'stop' });
  });
});

describe('previous and availability', () => {
  const order = [2, 0, 1];
  it('restarts after a few seconds or at the very first track', () => {
    expect(previous(order, 0, 10, mode())).toEqual({ kind: 'restart' });
    expect(previous(order, 2, 0, mode())).toEqual({ kind: 'restart' });
  });
  it('goes to the earlier track in play order', () => {
    expect(previous(order, 0, 1, mode())).toEqual({ kind: 'track', index: 2 });
  });
  it('wraps to the last track when repeating all', () => {
    expect(previous(order, 2, 0, mode({ repeat: 'all' }))).toEqual({ kind: 'track', index: 1 });
    expect(previous([0], 0, 0, mode({ repeat: 'all' }))).toEqual({ kind: 'restart' });
  });
  it('reports whether next / previous exist', () => {
    expect(hasNextTrack(order, 1, mode())).toBe(false);
    expect(hasNextTrack(order, 1, mode({ repeat: 'all' }))).toBe(true);
    expect(hasNextTrack(order, 2, mode())).toBe(true);
    expect(hasPreviousTrack(order, 2, mode())).toBe(false);
    expect(hasPreviousTrack(order, 2, mode({ repeat: 'all' }))).toBe(true);
    expect(hasPreviousTrack(order, 0, mode())).toBe(true);
  });
});
