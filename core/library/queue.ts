/** Pure queue navigation rules (unit-tested). The queue is simply an ordered list; index -1 = none. */

/** Index of the next track, or null when the current one is last (or nothing is playing). */
export function nextIndex(length: number, index: number): number | null {
  if (index < 0 || index >= length) return null;
  return index + 1 < length ? index + 1 : null;
}

export type PreviousAction = { kind: 'restart' } | { kind: 'track'; index: number };

/**
 * Usual "previous" button: after a few seconds into the track it restarts the track, otherwise (or
 * when there is no earlier track) it goes to the previous track.
 */
export function previousAction(
  index: number,
  positionSec: number,
  restartAfterSec = 3,
): PreviousAction {
  if (index <= 0 || positionSec > restartAfterSec) return { kind: 'restart' };
  return { kind: 'track', index: index - 1 };
}
