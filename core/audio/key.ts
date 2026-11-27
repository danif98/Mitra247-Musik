/**
 * Key detection (classic DSP, no AI): chromagram of the song (energy per pitch class, 12 values)
 * compared with the Krumhansl-Schmuckler major and minor profiles in all 12 transpositions.
 *
 * It is an estimate. Songs with clear harmony are right about 7 times out of 10; the relative
 * major/minor (C major and A minor share the same notes) are the usual mix-up. Songs that modulate,
 * bare vocals, drums only, or a tuning far from 440 Hz make it less reliable.
 */
import { fft } from './analysis';

export type KeyMode = 'major' | 'minor';

export interface DetectedKey {
  /** Pitch class of the tonic: 0 = C, 1 = C#, ... 11 = B. */
  tonic: number;
  mode: KeyMode;
  /** Correlation with the best profile, -1..1. */
  score: number;
  /** Gap to the runner-up key, 0..1; small means "not sure". */
  margin: number;
  /** True when the result is clear enough to show without "perkiraan" doubt. */
  confident: boolean;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

// Krumhansl-Kessler key profiles, index 0 = tonic.
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

const FRAME = 8192;
const HOP = 4096;
const MIN_HZ = 65; // C2
const MAX_HZ = 2100; // about C7
/** Longest stretch analysed: the middle of the song is enough and keeps it quick. */
const MAX_SECONDS = 150;

export function noteName(pitchClass: number): string {
  return NOTE_NAMES[((Math.round(pitchClass) % 12) + 12) % 12]!;
}

/** "G mayor", "E minor". */
export function formatKeyName(key: Pick<DetectedKey, 'tonic' | 'mode'>): string {
  return `${noteName(key.tonic)} ${key.mode === 'major' ? 'mayor' : 'minor'}`;
}

/** Short musician form: "G", "Em". */
export function formatKeyShort(key: Pick<DetectedKey, 'tonic' | 'mode'>): string {
  return `${noteName(key.tonic)}${key.mode === 'minor' ? 'm' : ''}`;
}

/** The same key moved by `semitones` (what the song becomes after "kunci +2"). */
export function transposeKey(key: DetectedKey, semitones: number): DetectedKey {
  return { ...key, tonic: (((key.tonic + Math.round(semitones)) % 12) + 12) % 12 };
}

/** Relative key: C major <-> A minor. */
export function relativeKey(key: Pick<DetectedKey, 'tonic' | 'mode'>): {
  tonic: number;
  mode: KeyMode;
} {
  return key.mode === 'major'
    ? { tonic: (key.tonic + 9) % 12, mode: 'minor' }
    : { tonic: (key.tonic + 3) % 12, mode: 'major' };
}

/** Energy per pitch class (12 values) of a mono signal. */
export function chromagram(samples: Float32Array, sampleRate: number): Float64Array {
  const chroma = new Float64Array(12);
  const maxSamples = Math.floor(MAX_SECONDS * sampleRate);
  let start = 0;
  let end = samples.length;
  if (end > maxSamples) {
    start = Math.floor((end - maxSamples) / 2);
    end = start + maxSamples;
  }
  const window = new Float64Array(FRAME);
  for (let i = 0; i < FRAME; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1));
  const binHz = sampleRate / FRAME;
  const lo = Math.max(1, Math.ceil(MIN_HZ / binHz));
  const hi = Math.min(FRAME / 2 - 1, Math.floor(MAX_HZ / binHz));
  // Pitch class of each bin, with a weight that favours the middle register where chords live.
  const pcOfBin = new Int8Array(hi + 1).fill(-1);
  const weight = new Float64Array(hi + 1);
  for (let k = lo; k <= hi; k++) {
    const midi = 69 + 12 * Math.log2((k * binHz) / 440);
    pcOfBin[k] = ((Math.round(midi) % 12) + 12) % 12;
    weight[k] = 1 / (1 + Math.max(0, (k * binHz - 1000) / 1000));
  }
  const re = new Float64Array(FRAME);
  const im = new Float64Array(FRAME);
  for (let pos = start; pos + FRAME <= end; pos += HOP) {
    let energy = 0;
    for (let i = 0; i < FRAME; i++) {
      const s = samples[pos + i]!;
      re[i] = s * window[i]!;
      im[i] = 0;
      energy += s * s;
    }
    if (energy / FRAME < 1e-7) continue; // silence
    fft(re, im);
    const frame = new Float64Array(12);
    for (let k = lo; k <= hi; k++) {
      // Square root of the magnitude: tames loud peaks (bass notes, drums).
      frame[pcOfBin[k]!]! += Math.sqrt(Math.hypot(re[k]!, im[k]!)) * weight[k]!;
    }
    let sum = 0;
    for (let c = 0; c < 12; c++) sum += frame[c]!;
    if (sum <= 0) continue;
    // Every frame counts equally, so a loud chorus does not outvote the verses.
    for (let c = 0; c < 12; c++) chroma[c]! += frame[c]! / sum;
  }
  return chroma;
}

function correlation(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i]!;
    mb += b[i]!;
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]! - ma;
    const y = b[i]! - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

/** Best key for a chroma vector, or null when it carries nothing. */
export function keyFromChroma(chroma: ArrayLike<number>): DetectedKey | null {
  let total = 0;
  for (let i = 0; i < 12; i++) total += chroma[i]!;
  if (!(total > 0)) return null;
  const scores: { tonic: number; mode: KeyMode; r: number }[] = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    // Profile rotated so that its first value lands on `tonic`.
    const maj = new Array<number>(12);
    const min = new Array<number>(12);
    for (let i = 0; i < 12; i++) {
      maj[(i + tonic) % 12] = MAJOR[i]!;
      min[(i + tonic) % 12] = MINOR[i]!;
    }
    scores.push({ tonic, mode: 'major', r: correlation(chroma, maj) });
    scores.push({ tonic, mode: 'minor', r: correlation(chroma, min) });
  }
  scores.sort((a, b) => b.r - a.r);
  const best = scores[0]!;
  const second = scores[1]!;
  const margin = Math.max(0, best.r - second.r);
  return {
    tonic: best.tonic,
    mode: best.mode,
    score: best.r,
    margin,
    // Clear = good match and not a coin flip with the runner-up.
    confident: best.r >= 0.7 && margin >= 0.04,
  };
}

/** Detect the key of a mono signal (any sample rate from about 8 kHz up). Null for silence. */
export function detectKey(samples: Float32Array, sampleRate: number): DetectedKey | null {
  return keyFromChroma(chromagram(samples, sampleRate));
}
