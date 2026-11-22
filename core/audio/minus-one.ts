/**
 * Minus One (classic DSP, no AI). Vocals are usually mixed in the centre, so every mode removes what
 * is identical in both channels. Results vary per recording; mono recordings become silent
 * (Dasar, Jaga bass) or are only band-filtered (Fokus vokal).
 *
 * With M = (L + R) / 2 (centre) and S = (L - R) / 2 (sides):
 *   basic  "Dasar"        out = S on both channels (bass/kick, also centred, disappear too)
 *   bass   "Jaga bass"    out = LP(M) + HP(S) on both channels: the centre survives below the cutoff
 *   focus  "Fokus vokal"  out = (M - k * BP(M)) +/- S: stereo is kept, only the vocal band of the centre
 *                         is attenuated (instruments in the same band lose some level too)
 * "Kekuatan" (strength) blends basic/bass with the untouched signal; in focus it is k.
 */

export type MinusOneMode = 'basic' | 'bass' | 'focus';
export const MINUS_ONE_MODES: readonly MinusOneMode[] = ['basic', 'bass', 'focus'];

export interface MinusOneParams {
  mode: MinusOneMode;
  /** 0..1 */
  strength: number;
  /** Jaga bass: frequency (Hz) below which the centre is kept. */
  cutoff: number;
  /** Fokus vokal: 0 (narrow) .. 1 (wide) vocal band. */
  width: number;
}

export const CUTOFF_MIN = 80;
export const CUTOFF_MAX = 300;

export const DEFAULT_MINUS_ONE: MinusOneParams = {
  mode: 'basic',
  strength: 1,
  cutoff: 150,
  width: 0.5,
};

function clamp(v: number, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

/** Accepts anything read from storage; invalid fields fall back to the defaults. */
export function clampMinusOneParams(
  raw: Partial<MinusOneParams> | null | undefined,
): MinusOneParams {
  const r = raw ?? {};
  const mode = MINUS_ONE_MODES.includes(r.mode as MinusOneMode)
    ? (r.mode as MinusOneMode)
    : DEFAULT_MINUS_ONE.mode;
  return {
    mode,
    strength: clamp(r.strength as number, 0, 1, DEFAULT_MINUS_ONE.strength),
    cutoff: Math.round(clamp(r.cutoff as number, CUTOFF_MIN, CUTOFF_MAX, DEFAULT_MINUS_ONE.cutoff)),
    width: clamp(r.width as number, 0, 1, DEFAULT_MINUS_ONE.width),
  };
}

/** Vocal band edges (Hz) for a width: 0 -> 600..2000 Hz, 0.5 -> 400..3500 Hz, 1 -> 200..5000 Hz. */
export function focusBand(width: number): { low: number; high: number } {
  const w = clamp(width, 0, 1, DEFAULT_MINUS_ONE.width);
  return { low: 600 - 400 * w, high: 2000 + 3000 * w };
}

export function paramsEqual(a: MinusOneParams, b: MinusOneParams): boolean {
  return (
    a.mode === b.mode && a.strength === b.strength && a.cutoff === b.cutoff && a.width === b.width
  );
}

/** Pure reference for mode "basic": (L - R) / 2. */
export function centerCancel(left: Float32Array, right: Float32Array): Float32Array {
  const n = Math.min(left.length, right.length);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (left[i]! - right[i]!) / 2;
  return out;
}

type Edge = [AudioNode, AudioNode];
interface Path {
  /** Connections from the shared M/S front end into this path (made only while the path is in use). */
  edges: Edge[];
  /** Final level of the path. */
  out: GainNode;
}

const FADE = 0.015;
const DISCONNECT_DELAY_MS = 90;

export class MinusOne {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly ctx: BaseAudioContext;
  private readonly dry: GainNode;
  private readonly split: ChannelSplitterNode;
  private readonly mid: GainNode;
  private readonly side: GainNode;
  private readonly paths: Record<MinusOneMode, Path>;
  private readonly bassLp: BiquadFilterNode[];
  private readonly bassHp: BiquadFilterNode[];
  private readonly focusHp: BiquadFilterNode;
  private readonly focusLp: BiquadFilterNode;
  private readonly focusK: GainNode;
  private params: MinusOneParams = { ...DEFAULT_MINUS_ONE };
  private on = false;
  private frontConnected = false;
  private readonly live = new Set<MinusOneMode>();
  private readonly timers = new Map<MinusOneMode, ReturnType<typeof setTimeout>>();

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    const g = (value = 1) => {
      const n = ctx.createGain();
      n.gain.value = value;
      return n;
    };
    this.input = g();
    this.output = g();
    this.dry = g();
    this.input.connect(this.dry).connect(this.output);

    // Shared front end: M = (L + R) / 2, S = (L - R) / 2.
    this.split = ctx.createChannelSplitter(2);
    this.mid = g(0.5);
    this.side = g(0.5);
    const invert = g(-1);
    this.split.connect(this.mid, 0);
    this.split.connect(this.mid, 1);
    this.split.connect(this.side, 0);
    this.split.connect(invert, 1);
    invert.connect(this.side);

    const biquad = (type: BiquadFilterType, f: number) => {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      // Web Audio: for lowpass/highpass the Q value is in dB. -3.0103 dB = linear Q 0.7071 (Butterworth).
      b.Q.value = -3.0103;
      return b;
    };
    // basic: S on both channels (the path level is the strength)
    const basicOut = g(0);
    const basicMerger = ctx.createChannelMerger(2);
    basicOut.connect(basicMerger, 0, 0);
    basicOut.connect(basicMerger, 0, 1);
    basicMerger.connect(this.output);

    // bass: LP(M) + HP(S), two cascaded 12 dB/oct stages each (24 dB/oct)
    this.bassLp = [
      biquad('lowpass', DEFAULT_MINUS_ONE.cutoff),
      biquad('lowpass', DEFAULT_MINUS_ONE.cutoff),
    ];
    this.bassHp = [
      biquad('highpass', DEFAULT_MINUS_ONE.cutoff),
      biquad('highpass', DEFAULT_MINUS_ONE.cutoff),
    ];
    const bassMix = g();
    this.bassLp[0]!.connect(this.bassLp[1]!).connect(bassMix);
    this.bassHp[0]!.connect(this.bassHp[1]!).connect(bassMix);
    const bassOut = g(0);
    const bassMerger = ctx.createChannelMerger(2);
    bassMix.connect(bassOut);
    bassOut.connect(bassMerger, 0, 0);
    bassOut.connect(bassMerger, 0, 1);
    bassMerger.connect(this.output);

    // focus: M' = M - k * BP(M); L = M' + S, R = M' - S
    const band = focusBand(DEFAULT_MINUS_ONE.width);
    this.focusHp = biquad('highpass', band.low);
    this.focusLp = biquad('lowpass', band.high);
    this.focusK = g(0);
    const mSum = g();
    const leftSum = g();
    const rightSum = g();
    const invert2 = g(-1);
    this.focusHp.connect(this.focusLp).connect(this.focusK).connect(mSum);
    mSum.connect(leftSum);
    mSum.connect(rightSum);
    invert2.connect(rightSum);
    const focusMerger = ctx.createChannelMerger(2);
    const focusOut = g(0);
    leftSum.connect(focusMerger, 0, 0);
    rightSum.connect(focusMerger, 0, 1);
    focusMerger.connect(focusOut).connect(this.output);

    this.paths = {
      basic: { edges: [[this.side, basicOut]], out: basicOut },
      bass: {
        edges: [
          [this.mid, this.bassLp[0]!],
          [this.side, this.bassHp[0]!],
        ],
        out: bassOut,
      },
      focus: {
        edges: [
          [this.mid, this.focusHp],
          [this.mid, mSum],
          [this.side, leftSum],
          [this.side, invert2],
        ],
        out: focusOut,
      },
    };
  }

  get enabled(): boolean {
    return this.on;
  }

  get current(): MinusOneParams {
    return { ...this.params };
  }

  setEnabled(enabled: boolean): void {
    this.on = enabled;
    this.update();
  }

  /** Apply (a subset of) the parameters; values are clamped. */
  apply(p: Partial<MinusOneParams>): void {
    this.params = clampMinusOneParams({ ...this.params, ...p });
    this.update();
  }

  private smooth(param: AudioParam, value: number): void {
    param.setTargetAtTime(value, this.ctx.currentTime, FADE);
  }

  private realtime(): boolean {
    return !(typeof OfflineAudioContext !== 'undefined' && this.ctx instanceof OfflineAudioContext);
  }

  private connectPath(mode: MinusOneMode): void {
    const timer = this.timers.get(mode);
    if (timer) clearTimeout(timer);
    this.timers.delete(mode);
    if (this.live.has(mode)) return;
    for (const [from, to] of this.paths[mode].edges) from.connect(to);
    this.live.add(mode);
  }

  private disconnectPath(mode: MinusOneMode): void {
    if (!this.live.has(mode) || this.timers.has(mode)) return; // not connected, or already scheduled
    const done = () => {
      for (const [from, to] of this.paths[mode].edges) from.disconnect(to);
      this.live.delete(mode);
      this.timers.delete(mode);
      if (this.live.size === 0 && this.frontConnected) {
        this.input.disconnect(this.split);
        this.frontConnected = false;
      }
    };
    if (this.realtime()) this.timers.set(mode, setTimeout(done, DISCONNECT_DELAY_MS));
    else done();
  }

  private update(): void {
    const { mode, strength, cutoff, width } = this.params;
    const active = this.on ? mode : null;

    if (active && !this.frontConnected) {
      this.input.connect(this.split);
      this.frontConnected = true;
    }
    if (active) this.connectPath(active);
    for (const m of MINUS_ONE_MODES) {
      if (m !== active) this.disconnectPath(m);
    }

    // Levels
    const blend = active === 'basic' || active === 'bass';
    this.smooth(this.dry.gain, !active ? 1 : blend ? 1 - strength : 0);
    this.smooth(this.paths.basic.out.gain, active === 'basic' ? strength : 0);
    this.smooth(this.paths.bass.out.gain, active === 'bass' ? strength : 0);
    this.smooth(this.paths.focus.out.gain, active === 'focus' ? 1 : 0);
    this.smooth(this.focusK.gain, -strength);

    // Tone
    for (const f of [...this.bassLp, ...this.bassHp]) this.smooth(f.frequency, cutoff);
    const band = focusBand(width);
    this.smooth(this.focusHp.frequency, band.low);
    this.smooth(this.focusLp.frequency, band.high);
  }
}
