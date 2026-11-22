import { describe, expect, it } from 'vitest';
import { generateSine } from '../audio/analysis';
import { computePeaks } from './peaks';

describe('computePeaks', () => {
  it('returns normalised max-abs per bucket', () => {
    const s = new Float32Array([0.1, -0.2, 0.4, -0.8, 0, 0.05, 0.1, -0.1]);
    const p = computePeaks(s, 4);
    expect(Array.from(p).map((v) => +v.toFixed(3))).toEqual([0.25, 1, 0.063, 0.125]);
  });
  it('handles silence, empty input and more buckets than samples', () => {
    expect(Array.from(computePeaks(new Float32Array(100), 5))).toEqual([0, 0, 0, 0, 0]);
    expect(computePeaks(new Float32Array(0), 3).length).toBe(3);
    expect(computePeaks(new Float32Array([0.5]), 4).length).toBe(4);
  });
  it('shows a loud-quiet-loud envelope', () => {
    const loud = generateSine(220, 8000, 1, 0.9);
    const quiet = generateSine(220, 8000, 1, 0.09);
    const all = new Float32Array(loud.length * 3);
    all.set(loud, 0);
    all.set(quiet, loud.length);
    all.set(loud, loud.length * 2);
    const p = computePeaks(all, 3);
    expect(p[0]).toBeGreaterThan(0.95);
    expect(p[1]).toBeLessThan(0.15);
    expect(p[2]).toBeGreaterThan(0.95);
  });
});
