import { describe, expect, it } from 'vitest';
import { nextIndex, previousAction } from './queue';

describe('nextIndex', () => {
  it('moves forward and stops at the end', () => {
    expect(nextIndex(3, 0)).toBe(1);
    expect(nextIndex(3, 1)).toBe(2);
    expect(nextIndex(3, 2)).toBeNull();
  });
  it('returns null for an empty queue or no current track', () => {
    expect(nextIndex(0, 0)).toBeNull();
    expect(nextIndex(3, -1)).toBeNull();
    expect(nextIndex(3, 7)).toBeNull();
  });
});

describe('previousAction', () => {
  it('restarts the track when more than 3 s in', () => {
    expect(previousAction(2, 3.5)).toEqual({ kind: 'restart' });
  });
  it('goes to the previous track near the start', () => {
    expect(previousAction(2, 1)).toEqual({ kind: 'track', index: 1 });
    expect(previousAction(1, 3)).toEqual({ kind: 'track', index: 0 });
  });
  it('restarts on the first track', () => {
    expect(previousAction(0, 0.5)).toEqual({ kind: 'restart' });
    expect(previousAction(-1, 0)).toEqual({ kind: 'restart' });
  });
});
