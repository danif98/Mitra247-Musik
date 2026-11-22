/**
 * 5-band equalizer: low shelf + 3 peaking + high shelf, built from BiquadFilterNodes.
 * `biquadMagnitudeDb` implements the RBJ cookbook formulas that Web Audio uses, so the response can
 * be unit-tested without an audio context.
 */
import { EQ_BANDS, EQ_MAX_DB } from '../practice/preset';

export interface EqBand {
  type: 'lowshelf' | 'peaking' | 'highshelf';
  frequency: number;
  q: number;
}

export const EQ_BAND_DEFS: readonly EqBand[] = [
  { type: 'lowshelf', frequency: 80, q: 0.707 },
  { type: 'peaking', frequency: 250, q: 1 },
  { type: 'peaking', frequency: 1000, q: 1 },
  { type: 'peaking', frequency: 4000, q: 1 },
  { type: 'highshelf', frequency: 12000, q: 0.707 },
];

/** Short labels for the UI ("80", "250", "1k", ...). */
export const EQ_BAND_LABELS = ['80', '250', '1k', '4k', '12k'] as const;

export function clampEqGain(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.min(EQ_MAX_DB, Math.max(-EQ_MAX_DB, db));
}

/** Magnitude (dB) of one biquad band at frequency `f` (RBJ audio EQ cookbook). */
export function biquadMagnitudeDb(
  band: EqBand,
  gainDb: number,
  f: number,
  sampleRate: number,
): number {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * band.frequency) / sampleRate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * band.q);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  if (band.type === 'peaking') {
    b0 = 1 + alpha * A;
    b1 = -2 * cos;
    b2 = 1 - alpha * A;
    a0 = 1 + alpha / A;
    a1 = -2 * cos;
    a2 = 1 - alpha / A;
  } else {
    // Shelving filters with shelf slope S = 1 expressed through alpha (Web Audio uses Q here).
    const sqrtA2alpha = 2 * Math.sqrt(A) * alpha;
    if (band.type === 'lowshelf') {
      b0 = A * (A + 1 - (A - 1) * cos + sqrtA2alpha);
      b1 = 2 * A * (A - 1 - (A + 1) * cos);
      b2 = A * (A + 1 - (A - 1) * cos - sqrtA2alpha);
      a0 = A + 1 + (A - 1) * cos + sqrtA2alpha;
      a1 = -2 * (A - 1 + (A + 1) * cos);
      a2 = A + 1 + (A - 1) * cos - sqrtA2alpha;
    } else {
      b0 = A * (A + 1 + (A - 1) * cos + sqrtA2alpha);
      b1 = -2 * A * (A - 1 + (A + 1) * cos);
      b2 = A * (A + 1 + (A - 1) * cos - sqrtA2alpha);
      a0 = A + 1 - (A - 1) * cos + sqrtA2alpha;
      a1 = 2 * (A - 1 - (A + 1) * cos);
      a2 = A + 1 - (A - 1) * cos - sqrtA2alpha;
    }
  }
  const w = (2 * Math.PI * f) / sampleRate;
  const cw = Math.cos(w);
  const c2w = Math.cos(2 * w);
  const sw = Math.sin(w);
  const s2w = Math.sin(2 * w);
  const nr = b0 + b1 * cw + b2 * c2w;
  const ni = -(b1 * sw + b2 * s2w);
  const dr = a0 + a1 * cw + a2 * c2w;
  const di = -(a1 * sw + a2 * s2w);
  const mag = Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
  return 20 * Math.log10(mag);
}

/** Combined response of all bands (dB) at frequency `f`. */
export function eqResponseDb(gains: readonly number[], f: number, sampleRate: number): number {
  return EQ_BAND_DEFS.reduce(
    (sum, band, i) => sum + biquadMagnitudeDb(band, clampEqGain(gains[i] ?? 0), f, sampleRate),
    0,
  );
}

export class Equalizer {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly filters: BiquadFilterNode[];

  constructor(ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.filters = EQ_BAND_DEFS.map((def) => {
      const f = ctx.createBiquadFilter();
      f.type = def.type;
      f.frequency.value = def.frequency;
      f.Q.value = def.q;
      f.gain.value = 0;
      return f;
    });
    let prev: AudioNode = this.input;
    for (const f of this.filters) {
      prev.connect(f);
      prev = f;
    }
    prev.connect(this.output);
  }

  get bands(): number {
    return EQ_BANDS;
  }

  /** Smoothly set one band (dB). */
  setGain(band: number, db: number): void {
    const f = this.filters[band];
    if (!f) return;
    f.gain.setTargetAtTime(clampEqGain(db), f.context.currentTime, 0.02);
  }

  setAll(gains: readonly number[]): void {
    for (let i = 0; i < EQ_BANDS; i++) this.setGain(i, gains[i] ?? 0);
  }
}
