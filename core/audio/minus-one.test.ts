import { describe, expect, it } from 'vitest';
import { dominantFrequency, generateSine, rms } from './analysis';
import { centerCancel } from './minus-one';

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
