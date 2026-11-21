/**
 * AudioWorkletProcessor wrapping PitchShifterCore (Rubber Band WASM).
 * Loaded through AudioContext.audioWorklet.addModule().
 *
 * Messages in:  { type: 'init', wasm: ArrayBuffer, engine }  |  { type: 'engine', engine }
 * Messages out: { type: 'ready', ... } | { type: 'stats', ... } | { type: 'error', message }
 */
import { PitchShifterCore } from '../pitch-shifter-core';
import type { RubberBandEngine } from '../pitch-math';

// AudioWorkletGlobalScope members that lib.dom / lib.webworker do not declare.
declare const sampleRate: number;
declare const currentTime: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}
declare function registerProcessor(name: string, ctor: unknown): void;

const STATS_EVERY_BLOCKS = 172; // ~0.5 s at 44.1 kHz / 128 frames
/** Time constant of the in-worklet pitch smoothing (log domain), in seconds. */
const SMOOTH_TAU = 0.008;

type InitMessage = { type: 'init'; wasm: ArrayBuffer; engine: RubberBandEngine };
type EngineMessage = { type: 'engine'; engine: RubberBandEngine };

class PitchProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'pitchRatio',
        defaultValue: 1,
        minValue: 0.05,
        maxValue: 16,
        automationRate: 'k-rate',
      },
    ];
  }

  private wasm: WebAssembly.Module | null = null;
  private core: PitchShifterCore | null = null;
  private building = false;
  private engine: RubberBandEngine = 'R2';
  private smoothed = 1;
  private sumMs = 0;
  private countMs = 0;
  private slowBlocks = 0;
  private passthroughBlocks = 0;
  private blockCount = 0;
  private readonly inScratch = [new Float32Array(128), new Float32Array(128)];
  private readonly outScratch = [new Float32Array(128), new Float32Array(128)];

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<InitMessage | EngineMessage>) => {
      const msg = e.data;
      if (msg.type === 'init') {
        this.engine = msg.engine;
        WebAssembly.compile(msg.wasm).then(
          (m) => {
            this.wasm = m;
            return this.build();
          },
          (err: unknown) => this.fail(err),
        );
      } else if (msg.type === 'engine') {
        this.engine = msg.engine;
        void this.build();
      }
    };
  }

  private async build(): Promise<void> {
    if (!this.wasm || this.building) return;
    this.building = true;
    try {
      const next = await PitchShifterCore.create(this.wasm, { sampleRate, engine: this.engine });
      next.setPitchRatio(this.smoothed);
      const old = this.core;
      this.core = next;
      old?.dispose();
      this.sumMs = this.countMs = this.slowBlocks = this.passthroughBlocks = 0;
      const s = next.stats();
      this.port.postMessage({
        type: 'ready',
        engine: this.engine,
        latencyFrames: s.latencyFrames,
        startDelayFrames: s.startDelayFrames,
        sampleRate,
      });
    } catch (err) {
      this.fail(err);
    } finally {
      this.building = false;
    }
  }

  private fail(err: unknown): void {
    this.port.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const frames = output[0]!.length;

    // Smooth the requested ratio in the log domain to avoid zipper noise.
    const target = parameters['pitchRatio']?.[0] ?? 1;
    const alpha = 1 - Math.exp(-frames / sampleRate / SMOOTH_TAU);
    this.smoothed = Math.exp(
      Math.log(this.smoothed) + (Math.log(target) - Math.log(this.smoothed)) * alpha,
    );

    const core = this.core;
    if (!core || !input || input.length === 0) {
      // WASM not ready yet (or silent input): pass audio through unshifted.
      for (let c = 0; c < output.length; c++) {
        const src = input?.[c] ?? input?.[0];
        if (src) output[c]!.set(src.subarray(0, frames));
        else output[c]!.fill(0);
      }
      if (!core) this.passthroughBlocks++;
      return true;
    }

    const inCh = [input[0] ?? this.inScratch[0]!, input[1] ?? input[0] ?? this.inScratch[1]!];
    const outCh = [output[0] ?? this.outScratch[0]!, output[1] ?? this.outScratch[1]!];

    const t0 = Date.now();
    core.setPitchRatio(this.smoothed);
    core.process(inCh, outCh, frames);
    const dt = Date.now() - t0;
    this.sumMs += dt;
    this.countMs++;
    if (dt >= (frames / sampleRate) * 1000) this.slowBlocks++;

    if (++this.blockCount % STATS_EVERY_BLOCKS === 0) {
      const s = core.stats();
      const budgetMs = (frames / sampleRate) * 1000;
      const avgMs = this.countMs ? this.sumMs / this.countMs : 0;
      this.port.postMessage({
        type: 'stats',
        engine: this.engine,
        blocks: s.blocks,
        underruns: s.underruns,
        primed: s.primed,
        fifoFrames: s.fifoFrames,
        latencyFrames: s.latencyFrames,
        // Date.now() has 1 ms resolution; the average over many blocks is a dithered estimate.
        avgBlockMs: avgMs,
        budgetMs,
        loadPct: (avgMs / budgetMs) * 100,
        slowBlocks: this.slowBlocks,
        pitchRatio: this.smoothed,
        contextTime: currentTime,
      });
      this.sumMs = 0;
      this.countMs = 0;
    }
    return true;
  }
}

registerProcessor('musik-pitch-processor', PitchProcessor);
