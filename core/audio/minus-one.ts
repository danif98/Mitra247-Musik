/**
 * Minus One (classic DSP, no AI): mode "Dasar" = centre-channel cancellation, out = (L - R) / 2 on
 * both channels. Vocals mixed in the centre cancel; bass/kick (also centred) cancel too.
 * Results vary per recording; mono recordings become silent.
 */

/** Pure reference implementation, used by unit tests and as the spec for the Web Audio graph. */
export function centerCancel(left: Float32Array, right: Float32Array): Float32Array {
  const n = Math.min(left.length, right.length);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (left[i]! - right[i]!) / 2;
  return out;
}

/** Web Audio graph: input -> (dry | L-R wet) -> output, switched with a short crossfade. */
export class MinusOne {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly dry: GainNode;
  private readonly wet: GainNode;
  private readonly ctx: BaseAudioContext;
  private on = false;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.wet.gain.value = 0;

    const splitter = ctx.createChannelSplitter(2);
    const invert = ctx.createGain();
    invert.gain.value = -1;
    const sum = ctx.createGain();
    sum.gain.value = 0.5; // (L - R) / 2
    const merger = ctx.createChannelMerger(2);

    this.input.connect(this.dry).connect(this.output);
    this.input.connect(splitter);
    splitter.connect(sum, 0); // L
    splitter.connect(invert, 1); // R
    invert.connect(sum);
    sum.connect(this.wet);
    this.wet.connect(merger, 0, 0);
    this.wet.connect(merger, 0, 1);
    merger.connect(this.output);
  }

  get enabled(): boolean {
    return this.on;
  }

  setEnabled(enabled: boolean): void {
    this.on = enabled;
    const t = this.ctx.currentTime;
    this.dry.gain.setTargetAtTime(enabled ? 0 : 1, t, 0.015);
    this.wet.gain.setTargetAtTime(enabled ? 1 : 0, t, 0.015);
  }
}
