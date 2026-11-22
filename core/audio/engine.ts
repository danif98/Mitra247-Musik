/**
 * Audio engine: <audio> -> MediaElementAudioSourceNode -> AudioWorkletNode (Rubber Band) -> GainNode
 * -> destination. See docs/FRONTEND.md 4.1 / 4.2.
 *
 * This module has no bundler-specific imports; asset URLs are injected by the caller.
 */
import {
  clamp,
  clampSemitone,
  clampTempo,
  computePitchRatio,
  preservesPitchFor,
  type PitchPath,
  type RubberBandEngine,
} from './pitch-math';

export interface EngineAssets {
  /** URL of the bundled AudioWorklet module. */
  workletUrl: string;
  /** URL of rubberband.wasm. */
  wasmUrl: string;
}

export interface EngineOptions {
  assets: EngineAssets;
  path?: PitchPath;
  engine?: RubberBandEngine;
  /** AudioContext latency hint. 'playback' favours stability (default). */
  latencyHint?: AudioContextLatencyCategory;
  /** Duration of the tempo / semitone ramp in ms. */
  rampMs?: number;
}

export interface WorkletStats {
  engine: RubberBandEngine;
  blocks: number;
  underruns: number;
  primed: boolean;
  fifoFrames: number;
  latencyFrames: number;
  avgBlockMs: number;
  budgetMs: number;
  loadPct: number;
  slowBlocks: number;
  mode: 'shift' | 'bypass' | 'warm';
  pitchRatio: number;
  contextTime: number;
}

export interface WorkletReady {
  engine: RubberBandEngine;
  latencyFrames: number;
  startDelayFrames: number;
  sampleRate: number;
}

export interface EngineEvents {
  stats?: (s: WorkletStats) => void;
  ready?: (r: WorkletReady) => void;
  error?: (message: string) => void;
  /** AudioContext state changes ('running' | 'suspended' | 'interrupted' | 'closed'). */
  stateChange?: (state: string) => void;
}

/** Minimal typing for the Chrome-only AudioContext.renderCapacity API. */
interface RenderCapacityLike extends EventTarget {
  start(opts: { updateInterval: number }): void;
  stop(): void;
}
interface RenderCapacityEvent extends Event {
  averageLoad: number;
  peakLoad: number;
  underrunRatio: number;
}

export interface RenderCapacitySample {
  averageLoad: number;
  peakLoad: number;
  underrunRatio: number;
}

export class MusikAudioEngine {
  readonly media: HTMLMediaElement;
  readonly events: EngineEvents = {};
  /** Last node of the graph; tests attach analysers here. */
  output!: GainNode;
  context!: AudioContext;
  renderCapacity: RenderCapacitySample | null = null;
  workletReady: WorkletReady | null = null;
  lastStats: WorkletStats | null = null;

  private node!: AudioWorkletNode;
  private source!: MediaElementAudioSourceNode;
  private path: PitchPath;
  private engine: RubberBandEngine;
  private tempo = 1;
  private semitone = 0;
  private fromTempo = 1;
  private fromSemitone = 0;
  private tempoTarget = 1;
  private semitoneTarget = 0;
  private rampStart = 0;
  private rampTimer: ReturnType<typeof setInterval> | null = null;
  private readonly rampMs: number;
  private readonly opts: EngineOptions;
  private disposed = false;

  constructor(media: HTMLMediaElement, opts: EngineOptions) {
    this.media = media;
    this.opts = opts;
    this.path = opts.path ?? 'A';
    this.engine = opts.engine ?? 'R2';
    this.rampMs = opts.rampMs ?? 80;
  }

  async init(): Promise<void> {
    const { assets } = this.opts;
    this.context = new AudioContext({ latencyHint: this.opts.latencyHint ?? 'playback' });
    this.context.addEventListener('statechange', () =>
      this.events.stateChange?.(this.context.state),
    );
    if (!this.context.audioWorklet) {
      throw new Error(
        'AudioWorklet unavailable: page is not a secure context (use HTTPS or http://localhost via adb reverse).',
      );
    }
    await this.context.audioWorklet.addModule(assets.workletUrl);
    const wasm = await (await fetch(assets.wasmUrl)).arrayBuffer();

    this.node = new AudioWorkletNode(this.context, 'musik-pitch-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
      channelCountMode: 'explicit',
      outputChannelCount: [2],
    });
    this.node.port.onmessage = (e: MessageEvent) => {
      const m = e.data as { type: string; message?: string };
      if (m.type === 'stats') {
        this.lastStats = e.data as WorkletStats;
        this.events.stats?.(this.lastStats);
      } else if (m.type === 'ready') {
        this.workletReady = e.data as WorkletReady;
        this.events.ready?.(this.workletReady);
      } else if (m.type === 'error') {
        this.events.error?.(m.message ?? 'worklet error');
      }
    };
    this.node.port.postMessage({ type: 'init', wasm, engine: this.engine }, [wasm]);

    this.source = this.context.createMediaElementSource(this.media);
    this.output = this.context.createGain();
    this.source.connect(this.node);
    this.node.connect(this.output);
    this.output.connect(this.context.destination);

    this.applyNow();
    this.startRenderCapacity();
  }

  /** Resume the context; call from a user gesture. */
  async resume(): Promise<void> {
    if (this.context.state !== 'running') await this.context.resume();
  }

  setVolume(volume: number): void {
    this.output.gain.setTargetAtTime(clamp(volume, 0, 1), this.context.currentTime, 0.02);
  }

  /** Smoothly move to a new tempo (0.25..2.0). */
  setTempo(tempo: number): void {
    this.retarget(clampTempo(tempo), this.semitoneTarget);
  }

  /** Smoothly move to a new transpose (-12..+12 semitones). */
  setSemitone(semitone: number): void {
    this.retarget(this.tempoTarget, clampSemitone(semitone));
  }

  /** Switch between path A (preservesPitch=false + corrected ratio) and path B. */
  setPath(path: PitchPath): void {
    this.path = path;
    this.applyNow();
  }

  /** Rebuild the Rubber Band instance with another engine (R2 default, R3 optional). */
  setEngine(engine: RubberBandEngine): void {
    this.engine = engine;
    this.node.port.postMessage({ type: 'engine', engine });
  }

  get currentPath(): PitchPath {
    return this.path;
  }
  get currentEngine(): RubberBandEngine {
    return this.engine;
  }
  get currentPitchRatio(): number {
    return computePitchRatio(this.path, this.tempo, this.semitone);
  }

  snapshot() {
    const ctx = this.context;
    return {
      sampleRate: ctx.sampleRate,
      baseLatency: ctx.baseLatency,
      outputLatency: (ctx as AudioContext & { outputLatency?: number }).outputLatency ?? null,
      state: ctx.state,
      path: this.path,
      engine: this.engine,
      tempo: this.tempo,
      semitone: this.semitone,
      pitchRatio: this.currentPitchRatio,
      playbackRate: this.media.playbackRate,
      preservesPitch: this.media.preservesPitch,
      worklet: this.lastStats,
      renderCapacity: this.renderCapacity,
    };
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    if (this.rampTimer) clearInterval(this.rampTimer);
    this.node.disconnect();
    await this.context.close();
  }

  // --- internals -----------------------------------------------------------------------------

  private retarget(tempo: number, semitone: number): void {
    this.tempoTarget = tempo;
    this.semitoneTarget = semitone;
    // Hidden pages throttle timers (screen off): jump straight to the target.
    if (typeof document !== 'undefined' && document.hidden) {
      this.tempo = tempo;
      this.semitone = semitone;
      this.applyNow();
      return;
    }
    this.fromTempo = this.tempo;
    this.fromSemitone = this.semitone;
    this.rampStart = performance.now();
    if (!this.rampTimer) this.rampTimer = setInterval(() => this.rampTick(), 16);
  }

  private rampTick(): void {
    if (this.disposed) return;
    const p = this.rampMs <= 0 ? 1 : (performance.now() - this.rampStart) / this.rampMs;
    const k = Math.min(1, Math.max(0, p));
    // Smoothstep so playbackRate and the pitch correction move together without corners.
    const e = k * k * (3 - 2 * k);
    this.tempo = this.fromTempo + (this.tempoTarget - this.fromTempo) * e;
    this.semitone = this.fromSemitone + (this.semitoneTarget - this.fromSemitone) * e;
    this.applyNow();
    if (k >= 1 && this.rampTimer) {
      clearInterval(this.rampTimer);
      this.rampTimer = null;
    }
  }

  /** Push the current tempo / semitone / path to the media element and worklet. */
  private applyNow(): void {
    this.media.preservesPitch = preservesPitchFor(this.path);
    this.media.playbackRate = this.tempo;
    const param = (this.node.parameters as AudioParamMap).get('pitchRatio');
    param?.setValueAtTime(this.currentPitchRatio, this.context.currentTime);
  }

  private startRenderCapacity(): void {
    const rc = (this.context as AudioContext & { renderCapacity?: RenderCapacityLike })
      .renderCapacity;
    if (!rc) return;
    rc.addEventListener('update', (ev) => {
      const e = ev as RenderCapacityEvent;
      this.renderCapacity = {
        averageLoad: e.averageLoad,
        peakLoad: e.peakLoad,
        underrunRatio: e.underrunRatio,
      };
    });
    rc.start({ updateInterval: 1 });
  }
}
