/**
 * Real-time pitch shifter around Rubber Band WASM. Runs both inside the AudioWorklet and in Node
 * (unit tests), so it must not touch any Web Audio / DOM globals.
 *
 * Time ratio is always 1: tempo is handled by the media element (see pitch-math.ts).
 */
import { RubberBandInterface, RubberBandOption } from 'rubberband-wasm';
import type { RubberBandEngine } from './pitch-math';

const O = RubberBandOption;
/**
 * Empirical correction (frames) added to `getLatency() + fifoFrames - block` so the dry path lines up
 * with the Rubber Band output at ratio 1 (measured by noise cross-correlation in bypass.test.ts,
 * valid for sample rates <= 48 kHz; bypass is disabled above that).
 */
const LAG_OFFSET: Record<RubberBandEngine, number> = { R2: 512, R3: -2036 };
const BYPASS_MAX_RATE = 48000;

/** R2 = classic "faster" engine (default, cheap). R3 = "finer" engine (heavier, better quality). */
export function engineOptions(engine: RubberBandEngine): number {
  const common =
    O.RubberBandOptionProcessRealTime |
    O.RubberBandOptionThreadingNever |
    O.RubberBandOptionChannelsTogether |
    O.RubberBandOptionWindowStandard;
  return engine === 'R3'
    ? common | O.RubberBandOptionEngineFiner
    : common | O.RubberBandOptionEngineFaster | O.RubberBandOptionPitchHighSpeed;
}

export interface ShifterStats {
  blocks: number;
  /** Blocks after priming where the FIFO could not supply a full block (audible dropout). */
  underruns: number;
  primed: boolean;
  latencyFrames: number;
  startDelayFrames: number;
  /** Frames currently buffered in the output FIFO. */
  fifoFrames: number;
  mode: 'shift' | 'bypass' | 'warm';
}

export interface ShifterOptions {
  sampleRate: number;
  engine: RubberBandEngine;
  /** Number of channels, fixed for the life of the instance. Default 2. */
  channels?: number;
  /** Frames buffered before output starts (jitter margin). Default 256 (R2) / 1024 (R3). */
  primeFrames?: number;
  /** Skip Rubber Band (delay-compensated dry path) while the ratio is exactly 1. Default true. */
  allowBypass?: boolean;
}

export class PitchShifterCore {
  private readonly rb: RubberBandInterface;
  private state: number;
  private readonly channels: number;
  private readonly primeFrames: number;
  private capacity = 0;
  private inPtrs: number[] = [];
  private inArrayPtr = 0;
  private outPtrs: number[] = [];
  private outArrayPtr = 0;
  private fifo: Float32Array[];
  private fifoRead = 0;
  private fifoCount = 0;
  private readonly fifoSize = 16384;
  private primed = false;
  private blocks = 0;
  private underruns = 0;
  private pitch = 1;
  private readonly allowBypass: boolean;
  /** 'shift': Rubber Band output. 'bypass': delayed dry signal. 'warm': RB restarting, dry is audible. */
  private mode: 'shift' | 'bypass' | 'warm' = 'shift';
  private readonly drySize = 16384;
  private dry: Float32Array[];
  private dryPos = 0;
  /** Delay (frames) between input and Rubber Band output, measured while shifting. */
  private lag = 0;
  private readonly tmpA: Float32Array[];
  private readonly tmpB: Float32Array[];
  readonly engine: RubberBandEngine;

  private constructor(rb: RubberBandInterface, opts: Required<ShifterOptions>) {
    this.rb = rb;
    this.channels = opts.channels;
    this.primeFrames = opts.primeFrames;
    this.allowBypass = opts.allowBypass && opts.sampleRate <= BYPASS_MAX_RATE;
    this.engine = opts.engine;
    this.dry = Array.from({ length: opts.channels }, () => new Float32Array(this.drySize));
    this.tmpA = Array.from({ length: opts.channels }, () => new Float32Array(1024));
    this.tmpB = Array.from({ length: opts.channels }, () => new Float32Array(1024));
    this.state = rb.rubberband_new(
      opts.sampleRate,
      opts.channels,
      engineOptions(opts.engine),
      1,
      1,
    );
    this.fifo = Array.from({ length: opts.channels }, () => new Float32Array(this.fifoSize));
    this.ensureCapacity(128);
  }

  static async create(
    wasm: WebAssembly.Module,
    options: ShifterOptions,
  ): Promise<PitchShifterCore> {
    const rb = await RubberBandInterface.initialize(wasm);
    return new PitchShifterCore(rb, {
      channels: 2,
      primeFrames: options.engine === 'R3' ? 1024 : 512,
      allowBypass: true,
      ...options,
    });
  }

  get pitchRatio(): number {
    return this.pitch;
  }

  setPitchRatio(ratio: number): void {
    if (!(ratio > 0)) return;
    // Changing the scale makes Rubber Band recompute; ignore sub-0.15-cent changes (big CPU saving).
    if (ratio !== 1 && this.pitch !== 1 && Math.abs(Math.log(ratio / this.pitch)) < 1e-4) return;
    if (ratio === this.pitch) return;
    this.pitch = ratio;
    if (this.mode !== 'bypass') this.rb.rubberband_set_pitch_scale(this.state, ratio);
  }

  /**
   * Process one block. `input` and `output` hold one Float32Array per channel; both have at least
   * `frames` samples. Output is zero-filled while priming or when the FIFO runs dry.
   * @returns true when a full block was produced.
   */
  process(input: Float32Array[], output: Float32Array[], frames: number): boolean {
    if (frames > this.tmpA[0]!.length) {
      for (let c = 0; c < this.channels; c++) {
        this.tmpA[c] = new Float32Array(frames);
        this.tmpB[c] = new Float32Array(frames);
      }
    }
    for (let c = 0; c < this.channels; c++) {
      const src = input[c] ?? input[0];
      const ring = this.dry[c]!;
      for (let i = 0; i < frames; i++) ring[(this.dryPos + i) % this.drySize] = src?.[i] ?? 0;
    }
    this.dryPos += frames;
    const wantBypass = this.allowBypass && this.pitch === 1;

    if (this.mode === 'bypass') {
      if (wantBypass) {
        this.readDry(output, frames);
        return true;
      }
      // Leave bypass: restart Rubber Band; the dry signal stays audible until it is primed.
      this.rb.rubberband_reset(this.state);
      this.rb.rubberband_set_pitch_scale(this.state, this.pitch);
      this.fifoRead = 0;
      this.fifoCount = 0;
      this.primed = false;
      this.mode = 'warm';
    }

    if (this.mode === 'warm') {
      const ok = this.processShift(input, this.tmpA, frames);
      this.readDry(output, frames);
      if (ok) {
        this.crossfade(output, this.tmpA, output, frames); // dry -> Rubber Band
        this.mode = 'shift';
      }
      return true;
    }

    // mode === 'shift'
    const ok = this.processShift(input, output, frames);
    if (wantBypass && ok) {
      this.readDry(this.tmpB, frames);
      this.crossfade(output, this.tmpB, output, frames); // Rubber Band -> dry
      this.mode = 'bypass';
    }
    return ok;
  }

  /** Copy `frames` of the dry signal delayed by `lag` into `out`. */
  private readDry(out: Float32Array[], frames: number): void {
    const start = this.dryPos - frames - this.lag + this.drySize * 4;
    for (let c = 0; c < this.channels; c++) {
      const ring = this.dry[c]!;
      const dst = out[c];
      if (!dst) continue;
      for (let i = 0; i < frames; i++) dst[i] = ring[(start + i) % this.drySize]!;
    }
  }

  /** out = a * (1 - t) + b * t with t rising 0 -> 1 across the block. `out` may alias `a`. */
  private crossfade(
    a: Float32Array[],
    b: Float32Array[],
    out: Float32Array[],
    frames: number,
  ): void {
    for (let c = 0; c < this.channels; c++) {
      const x = a[c];
      const y = b[c];
      const o = out[c];
      if (!x || !y || !o) continue;
      for (let i = 0; i < frames; i++) {
        const t = (i + 1) / frames;
        o[i] = x[i]! * (1 - t) + y[i]! * t;
      }
    }
  }

  private processShift(input: Float32Array[], output: Float32Array[], frames: number): boolean {
    this.ensureCapacity(frames);
    for (let c = 0; c < this.channels; c++) {
      const src = input[c] ?? input[0];
      if (src) this.rb.memWrite(this.inPtrs[c]!, src.subarray(0, frames));
    }
    this.rb.rubberband_process(this.state, this.inArrayPtr, frames, 0);
    this.drainToFifo();

    this.blocks++;
    if (!this.primed && this.fifoCount >= this.primeFrames) this.primed = true;
    if (!this.primed || this.fifoCount < frames) {
      if (this.primed) this.underruns++;
      for (const ch of output) ch.fill(0, 0, frames);
      return false;
    }
    this.lag =
      this.rb.rubberband_get_latency(this.state) +
      this.fifoCount -
      frames +
      LAG_OFFSET[this.engine];
    for (let c = 0; c < this.channels; c++) {
      const dst = output[c];
      if (!dst) continue;
      const buf = this.fifo[c]!;
      for (let i = 0; i < frames; i++) dst[i] = buf[(this.fifoRead + i) % this.fifoSize]!;
    }
    this.fifoRead = (this.fifoRead + frames) % this.fifoSize;
    this.fifoCount -= frames;
    return true;
  }

  stats(): ShifterStats {
    return {
      blocks: this.blocks,
      underruns: this.underruns,
      primed: this.primed,
      latencyFrames: this.rb.rubberband_get_latency(this.state),
      startDelayFrames: this.rb.rubberband_get_start_delay(this.state),
      fifoFrames: this.fifoCount,
      mode: this.mode,
    };
  }

  dispose(): void {
    if (this.state) this.rb.rubberband_delete(this.state);
    this.state = 0;
    for (const p of [...this.inPtrs, ...this.outPtrs, this.inArrayPtr, this.outArrayPtr]) {
      if (p) this.rb.free(p);
    }
    this.inPtrs = [];
    this.outPtrs = [];
  }

  private drainToFifo(): void {
    for (;;) {
      const available = this.rb.rubberband_available(this.state);
      if (available < 1) return;
      const room = this.fifoSize - this.fifoCount;
      const want = Math.min(available, this.capacity, room);
      if (want < 1) return; // FIFO full: drop nothing, RB keeps its backlog
      const got = this.rb.rubberband_retrieve(this.state, this.outArrayPtr, want);
      for (let c = 0; c < this.channels; c++) {
        const chunk = this.rb.memReadF32(this.outPtrs[c]!, got);
        const buf = this.fifo[c]!;
        let w = (this.fifoRead + this.fifoCount) % this.fifoSize;
        for (let i = 0; i < got; i++) {
          buf[w] = chunk[i]!;
          w = w + 1 === this.fifoSize ? 0 : w + 1;
        }
      }
      this.fifoCount += got;
      if (got < want) return;
    }
  }

  private ensureCapacity(frames: number): void {
    if (frames <= this.capacity) return;
    for (const p of [...this.inPtrs, ...this.outPtrs]) this.rb.free(p);
    if (this.inArrayPtr) this.rb.free(this.inArrayPtr);
    if (this.outArrayPtr) this.rb.free(this.outArrayPtr);
    this.capacity = Math.max(frames, 128);
    this.inArrayPtr = this.rb.malloc(this.channels * 4);
    this.outArrayPtr = this.rb.malloc(this.channels * 4);
    this.inPtrs = [];
    this.outPtrs = [];
    for (let c = 0; c < this.channels; c++) {
      const ip = this.rb.malloc(this.capacity * 4);
      const op = this.rb.malloc(this.capacity * 4);
      this.inPtrs.push(ip);
      this.outPtrs.push(op);
      this.rb.memWritePtr(this.inArrayPtr + c * 4, ip);
      this.rb.memWritePtr(this.outArrayPtr + c * 4, op);
    }
  }
}
