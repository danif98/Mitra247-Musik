import { describe, expect, it } from 'vitest';
import { dominantFrequency, generateSine, rms } from './analysis';
import {
  CUTOFF_MAX,
  CUTOFF_MIN,
  DEFAULT_MINUS_ONE,
  centerCancel,
  clampMinusOneParams,
  focusBand,
  paramsEqual,
} from './minus-one';

const SR = 44100;

describe('centerCancel (minus one, basic)', () => {
  it('removes a centred "vocal" and keeps panned instruments', () => {
    const vocal = generateSine(440, SR, 2, 0.5); // identical in L and R
    const guitar = generateSine(330, SR, 2, 0.4); // left only
    const keys = generateSine(550, SR, 2, 0.4); // right only
    const left = vocal.map((v, i) => v + guitar[i]!);
    const right = vocal.map((v, i) => v + keys[i]!);
    const out = centerCancel(left, right);

    // Vocal energy: project on 440 Hz by comparing with a sine-only mix.
    const vocalOnly = centerCancel(vocal, vocal);
    expect(rms(vocalOnly)).toBe(0);
    expect(rms(out)).toBeGreaterThan(0.1); // instruments survive
    const f = dominantFrequency(out.subarray(0, 32768), SR);
    expect([330, 550].some((t) => Math.abs(f - t) < 3)).toBe(true);

    // Vocal level before/after, measured by cancelling only the side parts.
    const before = rms(vocal);
    const mixOnlyVocalResidue = centerCancel(
      left.map((v, i) => v - guitar[i]!),
      right.map((v, i) => v - keys[i]!),
    );
    const reductionDb = 20 * Math.log10(before / Math.max(rms(mixOnlyVocalResidue), 1e-12));
    expect(reductionDb).toBeGreaterThan(60);
  });

  it('turns a mono recording into silence', () => {
    const mono = generateSine(440, SR, 1);
    expect(rms(centerCancel(mono, mono))).toBe(0);
  });
});

describe('minus one parameters', () => {
  it('defaults to basic mode at full strength', () => {
    expect(DEFAULT_MINUS_ONE).toEqual({ mode: 'basic', strength: 1, cutoff: 150, width: 0.5 });
  });

  it('clamps out-of-range values and repairs junk', () => {
    expect(clampMinusOneParams(null)).toEqual(DEFAULT_MINUS_ONE);
    expect(clampMinusOneParams({ strength: 5, cutoff: 10, width: -3 })).toMatchObject({
      strength: 1,
      cutoff: CUTOFF_MIN,
      width: 0,
    });
    expect(clampMinusOneParams({ cutoff: 9999 }).cutoff).toBe(CUTOFF_MAX);
    expect(clampMinusOneParams({ mode: 'nope' as never }).mode).toBe('basic');
    expect(clampMinusOneParams({ mode: 'focus', strength: Number.NaN }).strength).toBe(1);
    expect(clampMinusOneParams({ cutoff: 149.6 }).cutoff).toBe(150);
  });

  it('keeps valid values and compares parameter sets', () => {
    const p = clampMinusOneParams({ mode: 'bass', strength: 0.4, cutoff: 200, width: 0.9 });
    expect(p).toEqual({ mode: 'bass', strength: 0.4, cutoff: 200, width: 0.9 });
    expect(paramsEqual(p, { ...p })).toBe(true);
    expect(paramsEqual(p, { ...p, mode: 'focus' })).toBe(false);
  });

  it('vocal band widens with width and matches the PRD range around the default', () => {
    expect(focusBand(0)).toEqual({ low: 600, high: 2000 });
    expect(focusBand(1)).toEqual({ low: 200, high: 5000 });
    const mid = focusBand(0.5);
    expect(mid.low).toBeGreaterThanOrEqual(300);
    expect(mid.low).toBeLessThanOrEqual(500);
    expect(mid.high).toBeGreaterThanOrEqual(3400);
    expect(focusBand(0.7).high - focusBand(0.7).low).toBeGreaterThan(mid.high - mid.low);
  });
});
