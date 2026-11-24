/**
 * Play modes: auto next, repeat (off / one / all) and shuffle. Pure functions (unit-tested): the
 * player keeps a play order (a permutation of the queue indices, sequential when shuffle is off)
 * and asks these functions what comes next.
 */
import type { PreviousAction } from './queue';

export type RepeatMode = 'off' | 'one' | 'all';

export interface PlayMode {
  /** Continue with the next track when one ends (repeat "one" still repeats the track). */
  autoNext: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
}

export const DEFAULT_PLAY_MODE: PlayMode = { autoNext: true, repeat: 'off', shuffle: false };

/** Stored settings -> a valid PlayMode (unknown or missing fields fall back to the defaults). */
export function sanitizePlayMode(raw: unknown): PlayMode {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    autoNext: typeof o['autoNext'] === 'boolean' ? o['autoNext'] : DEFAULT_PLAY_MODE.autoNext,
    repeat: o['repeat'] === 'one' || o['repeat'] === 'all' ? o['repeat'] : 'off',
    shuffle: o['shuffle'] === true,
  };
}

/** off -> all -> one -> off (the order of the repeat button). */
export function nextRepeat(mode: RepeatMode): RepeatMode {
  return mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off';
}

/** [0, 1, ..., length - 1]. */
export function sequentialOrder(length: number): number[] {
  return Array.from({ length: Math.max(0, length) }, (_, i) => i);
}

/** Random play order of every index; `first` (when valid) is placed first. Fisher-Yates. */
export function shuffleOrder(
  length: number,
  first: number,
  random: () => number = Math.random,
): number[] {
  const rest = sequentialOrder(length).filter((i) => i !== first);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  return first >= 0 && first < length ? [first, ...rest] : rest;
}

/** Fresh random order for the next round (repeat all); it never starts with the track just played. */
export function reshuffle(
  length: number,
  last: number,
  random: () => number = Math.random,
): number[] {
  const order = shuffleOrder(length, -1, random);
  if (length > 1 && order[0] === last) [order[0], order[1]] = [order[1]!, order[0]!];
  return order;
}

export type Advance =
  | { kind: 'stop' }
  /** The same track again (repeat "one" after it ended). */
  | { kind: 'restart' }
  /** `wrapped`: the round is over and starts again (repeat all). */
  | { kind: 'track'; index: number; wrapped: boolean };

/**
 * What follows the current track. 'ended' = the track finished by itself, 'manual' = the Next
 * button (which ignores "auto next off" and "repeat one").
 */
export function advance(
  order: number[],
  index: number,
  reason: 'ended' | 'manual',
  mode: PlayMode,
): Advance {
  const pos = order.indexOf(index);
  if (pos < 0) return { kind: 'stop' };
  if (reason === 'ended') {
    if (mode.repeat === 'one') return { kind: 'restart' };
    if (!mode.autoNext) return { kind: 'stop' };
  }
  if (pos + 1 < order.length) return { kind: 'track', index: order[pos + 1]!, wrapped: false };
  if (mode.repeat === 'all') return { kind: 'track', index: order[0]!, wrapped: true };
  return { kind: 'stop' };
}

/** Previous button: restart after a few seconds, else the earlier track (the last one when repeating all). */
export function previous(
  order: number[],
  index: number,
  positionSec: number,
  mode: PlayMode,
  restartAfterSec = 3,
): PreviousAction {
  const pos = order.indexOf(index);
  if (pos < 0 || positionSec > restartAfterSec) return { kind: 'restart' };
  if (pos > 0) return { kind: 'track', index: order[pos - 1]! };
  if (mode.repeat === 'all' && order.length > 1) {
    return { kind: 'track', index: order[order.length - 1]! };
  }
  return { kind: 'restart' };
}

/** Is there a track after / before this one (for the buttons and the notification)? */
export function hasNextTrack(order: number[], index: number, mode: PlayMode): boolean {
  return advance(order, index, 'manual', mode).kind === 'track';
}

export function hasPreviousTrack(order: number[], index: number, mode: PlayMode): boolean {
  const pos = order.indexOf(index);
  return pos > 0 || (pos === 0 && mode.repeat === 'all' && order.length > 1);
}
