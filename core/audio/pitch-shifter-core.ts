/**
 * Real-time pitch shifter around Rubber Band WASM. Runs both inside the AudioWorklet and in Node
 * (unit tests), so it must not touch any Web Audio / DOM globals.
 *
 * Time ratio is always 1: tempo is handled by the media element (see pitch-math.ts).
 */
import { RubberBandInterface, RubberBandOption } from 'rubberband-wasm';
import type { RubberBandEngine } from './pitch-math';

const O = RubberBandOption;

/** R2 = classic "faster" engine (default, cheap). R3 = "finer" engine (heavier, better quality). */
export function engineOptions(engine: RubberBandEngine): number {
  const common =
    O.RubberBandOptionProcessRealTime |
    O.RubberBandOptionThreadingNever |
    O.RubberBandOptionChannelsTogether |
    O.RubberBandOptionWindowStandard;
  return engine === 'R3'
    ? common | O.RubberBandOptionEngineFiner
    : common | O.RubberBandOptionEngineFaster | O.RubberBandOptionPitchHighConsistency;
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
}

export interface ShifterOptions {
  sampleRate: number;
  engine: RubberBandEngine;
  /** Number of channels, fixed for the life of the instance. Default 2. */
  channels?: number;
  /** Frames buffered before output starts (jitter margin). Default 256 (R2) / 1024 (R3). */
  primeFrames?: number;
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
  readonly engine: RubberBandEngine;

  private constructor(rb: RubberBandInterface, opts: Required<ShifterOptions>) {
    this.rb = rb;
    this.channels = opts.channels;
    this.primeFrames = opts.primeFrames;
    this.engine = opts.engine;
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
      primeFrames: options.engine === 'R3' ? 1024 : 256,
      ...options,
    });
  }

  get pitchRatio(): number {
    return this.pitch;
  }

  setPitchRatio(ratio: number): void {
    if (ratio === this.pitch || !(ratio > 0)) return;
    this.pitch = ratio;
    this.rb.rubberband_set_pitch_scale(this.state, ratio);
  }

  /**
   * Process one block. `input` and `output` hold one Float32Array per channel; both have at least
   * `frames` samples. Output is zero-filled while priming or when the FIFO runs dry.
   * @returns true when a full block was produced.
   */
  process(input: Float32Array[], output: Float32Array[], frames: number): boolean {
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
