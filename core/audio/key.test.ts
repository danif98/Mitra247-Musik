import { describe, expect, it } from 'vitest';
import {
  chromagram,
  detectKey,
  formatKeyName,
  formatKeyShort,
  keyFromChroma,
  noteName,
  relativeKey,
  transposeKey,
} from './key';

const SR = 11025;

/** MIDI note number to Hz. */
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** A chord as a sum of notes with a few harmonics each, plus a little noise. */
function chord(notes: number[], seconds: number, seed: number): Float32Array {
  const n = Math.floor(seconds * SR);
  const out = new Float32Array(n);
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296 - 0.5) * 0.02;
  for (const m of notes) {
    const f = hz(m);
    for (let h = 1; h <= 4; h++) {
      const amp = 0.12 / h;
      for (let i = 0; i < n; i++) out[i]! += amp * Math.sin((2 * Math.PI * f * h * i) / SR);
    }
  }
  for (let i = 0; i < n; i++) out[i]! += rnd();
  return out;
}

function song(progression: number[][], bars: number): Float32Array {
  const parts: Float32Array[] = [];
  for (let b = 0; b < bars; b++)
    parts.push(chord(progression[b % progression.length]!, 1.5, b + 1));
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Float32Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Triads as MIDI notes above a root (48 = C3). */
const major = (root: number) => [root, root + 4, root + 7];
const minor = (root: number) => [root, root + 3, root + 7];

/** I - IV - V - I (major) and i - iv - V - i (minor), transposed by `shift`. */
const majorProgression = (shift: number) =>
  [major(48), major(53), major(55), major(48)].map((c) => c.map((n) => n + shift));
const minorProgression = (shift: number) =>
  [minor(57), minor(50), major(52), minor(57)].map((c) => c.map((n) => n + shift));

describe('detectKey', () => {
  it('finds C major in a I-IV-V-I song', () => {
    const k = detectKey(song(majorProgression(0), 16), SR)!;
    expect(k.tonic).toBe(0);
    expect(k.mode).toBe('major');
    expect(k.confident).toBe(true);
  });

  it('finds A minor in an i-iv-V-i song', () => {
    const k = detectKey(song(minorProgression(0), 16), SR)!;
    expect(k.tonic).toBe(9);
    expect(k.mode).toBe('minor');
  });

  for (const shift of [2, 3, 5, 7, 9, 11]) {
    it(`follows a transposition of +${shift} semitones (major)`, () => {
      const k = detectKey(song(majorProgression(shift), 16), SR)!;
      expect(k.tonic).toBe(shift % 12);
      expect(k.mode).toBe('major');
    });
  }

  it('finds a minor key after transposing too', () => {
    const k = detectKey(song(minorProgression(3), 16), SR)!;
    expect(k.tonic).toBe((9 + 3) % 12);
    expect(k.mode).toBe('minor');
  });

  it('returns null for silence', () => {
    expect(detectKey(new Float32Array(SR * 10), SR)).toBeNull();
  });

  it('works on a clip shorter than one frame', () => {
    expect(detectKey(new Float32Array(100), SR)).toBeNull();
  });

  it('is not sure about noise', () => {
    let s = 7;
    const noise = new Float32Array(SR * 10).map(
      () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296 - 0.5) * 0.5,
    );
    const k = detectKey(noise, SR);
    expect(k === null || k.confident === false).toBe(true);
  });

  it('analyses only the middle of a very long signal', () => {
    // 5 minutes of silence with a clear C major section in the middle: still found.
    const middle = song(majorProgression(0), 24);
    const long = new Float32Array(SR * 300);
    long.set(middle, Math.floor((long.length - middle.length) / 2));
    const k = detectKey(long, SR)!;
    expect(k.tonic).toBe(0);
    expect(k.mode).toBe('major');
  });
});

describe('chromagram / keyFromChroma', () => {
  it('a single A note puts its energy on pitch class 9', () => {
    const c = chromagram(chord([57], 4, 3), SR);
    expect(c.indexOf(Math.max(...c))).toBe(9);
  });

  it('keyFromChroma is null for an empty vector', () => {
    expect(keyFromChroma(new Float64Array(12))).toBeNull();
  });

  it('a pure scale profile gives its own key', () => {
    // C major scale notes equally weighted: C major or its relative A minor (same notes).
    const scale = new Float64Array(12);
    for (const pc of [0, 2, 4, 5, 7, 9, 11]) scale[pc] = 1;
    scale[0] = 1.6;
    const k = keyFromChroma(scale)!;
    expect(k.tonic).toBe(0);
    expect(k.mode).toBe('major');
  });
});

describe('names', () => {
  it('formats keys', () => {
    expect(formatKeyName({ tonic: 7, mode: 'major' })).toBe('G mayor');
    expect(formatKeyName({ tonic: 4, mode: 'minor' })).toBe('E minor');
    expect(formatKeyShort({ tonic: 6, mode: 'minor' })).toBe('F#m');
    expect(noteName(13)).toBe('C#');
    expect(noteName(-1)).toBe('B');
  });

  it('transposes a key', () => {
    const g = { tonic: 7, mode: 'major', score: 0.9, margin: 0.2, confident: true } as const;
    expect(transposeKey(g, 2).tonic).toBe(9);
    expect(transposeKey(g, -8).tonic).toBe(11);
    expect(transposeKey(g, 12).tonic).toBe(7);
  });

  it('gives the relative key', () => {
    expect(relativeKey({ tonic: 0, mode: 'major' })).toEqual({ tonic: 9, mode: 'minor' });
    expect(relativeKey({ tonic: 9, mode: 'minor' })).toEqual({ tonic: 0, mode: 'major' });
  });
});
