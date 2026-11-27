/**
 * Loudness normalisation: measure how loud a song is and compute one gain that brings every song
 * to the same level. Pure functions; decoding lives in the app (it needs an AudioContext).
 *
 * The measure is a gated RMS (400 ms blocks, silence and quiet passages ignored), close to the
 * idea of EBU R128 without K-weighting. It is an estimate, not a broadcast meter.
 */

/** Target level of the gated RMS, in dBFS. Most pop masters sit between -9 and -14. */
export const NORMALIZE_TARGET_DB = -14;
/** The gain never moves a song more than this many dB, up or down. */
export const NORMALIZE_MAX_DB = 12;
/** Largest value of the volume slider (1 = 100%). Above 1 the sound is amplified. */
export const VOLUME_MAX = 2;

const BLOCK_SECONDS = 0.4;
const ABSOLUTE_GATE_DB = -60;
const RELATIVE_GATE_DB = 10;

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

function powerToDb(power: number): number {
  return power > 0 ? 10 * Math.log10(power) : -Infinity;
}

/**
 * Gated RMS of a mono signal in dBFS, or null when the signal has no audible content.
 * Blocks quieter than -60 dBFS are dropped, then blocks more than 10 dB below the average of
 * the rest are dropped, so a long intro or fade-out does not change the result.
 */
export function measureLoudnessDb(samples: Float32Array, sampleRate: number): number | null {
  const size = Math.max(1, Math.round(sampleRate * BLOCK_SECONDS));
  const blocks: number[] = [];
  for (let start = 0; start + size <= samples.length; start += size) {
    let sum = 0;
    for (let i = start; i < start + size; i++) sum += samples[i]! * samples[i]!;
    blocks.push(sum / size);
  }
  if (blocks.length === 0 && samples.length > 0) {
    let sum = 0;
    for (const s of samples) sum += s * s;
    blocks.push(sum / samples.length);
  }
  const loud = blocks.filter((p) => powerToDb(p) > ABSOLUTE_GATE_DB);
  if (loud.length === 0) return null;
  const meanLoud = loud.reduce((a, b) => a + b, 0) / loud.length;
  const gate = powerToDb(meanLoud) - RELATIVE_GATE_DB;
  const kept = loud.filter((p) => powerToDb(p) > gate);
  const mean = kept.reduce((a, b) => a + b, 0) / kept.length;
  return powerToDb(mean);
}

/** Gain in dB that moves a song of `loudnessDb` to the target, limited to +-NORMALIZE_MAX_DB. */
export function normalizeGainDb(
  loudnessDb: number | null,
  targetDb: number = NORMALIZE_TARGET_DB,
): number {
  if (loudnessDb === null || !Number.isFinite(loudnessDb)) return 0;
  return Math.min(NORMALIZE_MAX_DB, Math.max(-NORMALIZE_MAX_DB, targetDb - loudnessDb));
}

/** Volume slider value to the text shown next to it ("85%", "150%"). */
export function formatVolumePercent(volume: number): string {
  return `${Math.round(volume * 100)}%`;
}
