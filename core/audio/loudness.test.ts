import { describe, expect, it } from 'vitest';
import { generateSine } from './analysis';
import {
  NORMALIZE_MAX_DB,
  dbToGain,
  formatVolumePercent,
  measureLoudnessDb,
  normalizeGainDb,
} from './loudness';

const SR = 8000;

function sine(amp: number, seconds: number): Float32Array {
  return generateSine(440, SR, seconds, amp);
}

describe('measureLoudnessDb', () => {
  it('measures a sine: amplitude 1 gives about -3 dBFS RMS', () => {
    const db = measureLoudnessDb(sine(1, 3), SR);
    expect(db).not.toBeNull();
    expect(db!).toBeCloseTo(-3.01, 1);
  });

  it('is 6 dB lower for half the amplitude', () => {
    const a = measureLoudnessDb(sine(0.5, 3), SR)!;
    const b = measureLoudnessDb(sine(0.25, 3), SR)!;
    expect(a - b).toBeCloseTo(6.02, 1);
  });

  it('returns null for silence', () => {
    expect(measureLoudnessDb(new Float32Array(SR * 2), SR)).toBeNull();
  });

  it('ignores a quiet intro (relative gate)', () => {
    const intro = sine(0.001, 4);
    const body = sine(0.5, 4);
    const both = new Float32Array(intro.length + body.length);
    both.set(intro, 0);
    both.set(body, intro.length);
    expect(measureLoudnessDb(both, SR)!).toBeCloseTo(measureLoudnessDb(body, SR)!, 1);
  });

  it('handles a clip shorter than one block', () => {
    expect(measureLoudnessDb(sine(0.5, 0.1), SR)).not.toBeNull();
  });
});

describe('normalizeGainDb', () => {
  it('lifts a quiet song and lowers a loud one', () => {
    expect(normalizeGainDb(-20)).toBeCloseTo(6);
    expect(normalizeGainDb(-8)).toBeCloseTo(-6);
  });

  it('is limited to the maximum', () => {
    expect(normalizeGainDb(-50)).toBe(NORMALIZE_MAX_DB);
    expect(normalizeGainDb(0, -40)).toBe(-NORMALIZE_MAX_DB);
  });

  it('does nothing when the loudness is unknown', () => {
    expect(normalizeGainDb(null)).toBe(0);
    expect(normalizeGainDb(NaN)).toBe(0);
  });

  it('two songs of different level end at the same level', () => {
    const quiet = measureLoudnessDb(sine(0.1, 3), SR)!;
    const loud = measureLoudnessDb(sine(0.6, 3), SR)!;
    const a = quiet + normalizeGainDb(quiet);
    const b = loud + normalizeGainDb(loud);
    expect(a).toBeCloseTo(b, 1);
  });
});

describe('helpers', () => {
  it('dbToGain', () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(6.0206)).toBeCloseTo(2, 3);
  });
  it('formatVolumePercent', () => {
    expect(formatVolumePercent(1)).toBe('100%');
    expect(formatVolumePercent(1.5)).toBe('150%');
    expect(formatVolumePercent(0.333)).toBe('33%');
  });
});
