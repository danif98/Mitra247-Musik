import { describe, expect, it } from 'vitest';
import {
  centsToRatio,
  centsToSemitones,
  clampSemitone,
  clampTempo,
  computePitchRatio,
  preservesPitchFor,
  ratioToSemitones,
  semitonesToCents,
  semitonesToRatio,
  snapTempo,
} from './pitch-math';

describe('semitone / cent conversion', () => {
  it('12 semitones is one octave', () => {
    expect(semitonesToRatio(12)).toBeCloseTo(2, 12);
    expect(semitonesToRatio(-12)).toBeCloseTo(0.5, 12);
    expect(semitonesToRatio(0)).toBe(1);
  });
  it('round trips ratio <-> semitones', () => {
    for (const s of [-12, -4.5, -1, 0, 0.25, 3, 12]) {
      expect(ratioToSemitones(semitonesToRatio(s))).toBeCloseTo(s, 10);
    }
  });
  it('cents <-> semitones', () => {
    expect(centsToSemitones(50)).toBe(0.5);
    expect(semitonesToCents(2)).toBe(200);
    expect(centsToRatio(1200)).toBeCloseTo(2, 12);
    expect(centsToRatio(100)).toBeCloseTo(semitonesToRatio(1), 12);
  });
});

describe('range limiters', () => {
  it('clamps tempo to 0.25..2.0', () => {
    expect(clampTempo(0.1)).toBe(0.25);
    expect(clampTempo(3)).toBe(2);
    expect(clampTempo(1.3)).toBe(1.3);
    expect(clampTempo(Number.NaN)).toBe(0.25);
  });
  it('clamps semitone to -12..+12', () => {
    expect(clampSemitone(-20)).toBe(-12);
    expect(clampSemitone(20)).toBe(12);
    expect(clampSemitone(5)).toBe(5);
  });
  it('snaps tempo to 0.05 steps', () => {
    expect(snapTempo(0.87)).toBe(0.85);
    expect(snapTempo(0.88)).toBe(0.9);
    expect(snapTempo(2.4)).toBe(2);
    expect(snapTempo(0.01)).toBe(0.25);
  });
});

describe('computePitchRatio', () => {
  it('path A = 2^(st/12) / tempo', () => {
    expect(computePitchRatio('A', 1, 0)).toBe(1);
    expect(computePitchRatio('A', 0.5, 0)).toBeCloseTo(2, 12);
    expect(computePitchRatio('A', 2, 0)).toBeCloseTo(0.5, 12);
    expect(computePitchRatio('A', 0.5, 12)).toBeCloseTo(4, 12);
    expect(computePitchRatio('A', 1.25, 2)).toBeCloseTo(semitonesToRatio(2) / 1.25, 12);
  });
  it('path B = 2^(st/12), tempo independent', () => {
    expect(computePitchRatio('B', 0.5, 0)).toBe(1);
    expect(computePitchRatio('B', 0.5, 12)).toBeCloseTo(2, 12);
    expect(computePitchRatio('B', 1.7, -12)).toBeCloseTo(0.5, 12);
  });
  it('clamps out-of-range inputs', () => {
    expect(computePitchRatio('A', 0.01, 99)).toBeCloseTo(semitonesToRatio(12) / 0.25, 12);
    expect(computePitchRatio('B', 1, -99)).toBeCloseTo(0.5, 12);
  });
  it('adds fine-tune cents', () => {
    expect(computePitchRatio('B', 1, 0, 50)).toBeCloseTo(semitonesToRatio(0.5), 12);
    expect(computePitchRatio('B', 1, 0, 500)).toBeCloseTo(semitonesToRatio(0.5), 12);
  });
  it('preservesPitch only on path B', () => {
    expect(preservesPitchFor('A')).toBe(false);
    expect(preservesPitchFor('B')).toBe(true);
  });
});
