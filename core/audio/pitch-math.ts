/**
 * Pure math for tempo / pitch control. No Web Audio dependency, so it is unit-testable in Node.
 *
 * Path A: <audio>.playbackRate = tempo, preservesPitch = false. The browser resamples (pitch moves
 *         with tempo), and Rubber Band applies ratio = 2^(semitone/12) / tempo to correct it.
 * Path B: <audio>.playbackRate = tempo, preservesPitch = true. The browser time-stretches, and
 *         Rubber Band applies a plain transpose ratio = 2^(semitone/12).
 */

export const TEMPO_MIN = 0.25;
export const TEMPO_MAX = 2.0;
export const TEMPO_STEP = 0.05;
export const SEMITONE_MIN = -12;
export const SEMITONE_MAX = 12;
export const CENTS_MIN = -50;
export const CENTS_MAX = 50;

export type PitchPath = 'A' | 'B';
export type RubberBandEngine = 'R2' | 'R3';

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function clampTempo(tempo: number): number {
  return clamp(tempo, TEMPO_MIN, TEMPO_MAX);
}

export function clampSemitone(semitone: number): number {
  return clamp(semitone, SEMITONE_MIN, SEMITONE_MAX);
}

export function clampCents(cents: number): number {
  return clamp(cents, CENTS_MIN, CENTS_MAX);
}

/** Round tempo to the UI step (0.05) and clamp to the allowed range. */
export function snapTempo(tempo: number): number {
  const snapped = Math.round(tempo / TEMPO_STEP) * TEMPO_STEP;
  return clampTempo(Math.round(snapped * 1e6) / 1e6);
}

export function semitonesToRatio(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

export function ratioToSemitones(ratio: number): number {
  return 12 * Math.log2(ratio);
}

export function centsToSemitones(cents: number): number {
  return cents / 100;
}

export function semitonesToCents(semitones: number): number {
  return semitones * 100;
}

export function centsToRatio(cents: number): number {
  return Math.pow(2, cents / 1200);
}

/** Pitch ratio passed to Rubber Band for the given path. Inputs are clamped to the valid range. */
export function computePitchRatio(
  path: PitchPath,
  tempo: number,
  semitone: number,
  cents = 0,
): number {
  const t = clampTempo(tempo);
  const transpose = semitonesToRatio(clampSemitone(semitone) + centsToSemitones(clampCents(cents)));
  return path === 'A' ? transpose / t : transpose;
}

/** Value for HTMLMediaElement.preservesPitch for the given path. */
export function preservesPitchFor(path: PitchPath): boolean {
  return path === 'B';
}

/** Linear interpolation helper used by the UI-side parameter ramp. */
export function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * clamp(progress, 0, 1);
}
