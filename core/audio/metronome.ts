/**
 * Metronome and count-in on the Web Audio clock (look-ahead scheduling, so timing does not depend on
 * timers). Clicks are short enveloped oscillator blips; the first beat of a bar is accented.
 */

export const BPM_MIN = 30;
export const BPM_MAX = 240;

export function clampBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) return 100;
  return Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(bpm)));
}

export function beatInterval(bpm: number): number {
  return 60 / clampBpm(bpm);
}

/** Beat 0 of every bar is the accent. */
export function isAccent(beatIndex: number, beatsPerBar: number): boolean {
  return beatsPerBar <= 1 ? true : beatIndex % beatsPerBar === 0;
}

/** Times (audio clock) of `count` beats starting at `startAt`. */
export function beatTimes(startAt: number, bpm: number, count: number): number[] {
  const iv = beatInterval(bpm);
  return Array.from({ length: count }, (_, i) => startAt + i * iv);
}

export interface ScheduledClick {
  time: number;
  accent: boolean;
}

const LOOKAHEAD_SEC = 0.12;
const TICK_MS = 25;

export class Metronome {
  bpm = 100;
  beatsPerBar = 4;
  volume = 0.6;
  /** Recently scheduled clicks (diagnostics and tests). */
  readonly scheduled: ScheduledClick[] = [];

  private readonly out: GainNode;
  private timer: ReturnType<typeof setInterval> | null = null;
  private startAt = 0;
  private beat = 0;
  /** Position inside the bar of the next click (survives a tempo re-base). */
  private barBeat = 0;
  /** Clicks scheduled before the last re-base (only used to honour maxBeats). */
  private beatsDone = 0;
  private maxBeats = Infinity;

  constructor(
    private readonly ctx: BaseAudioContext,
    destination: AudioNode,
  ) {
    this.out = ctx.createGain();
    this.out.connect(destination);
  }

  get running(): boolean {
    return this.timer !== null;
  }

  /**
   * Change the tempo. While running, the schedule is re-based on the next unscheduled beat so the
   * new rate starts without a gap or a jump (beats already queued are not moved).
   */
  setBpm(bpm: number): void {
    const next = clampBpm(bpm);
    if (this.timer && next !== this.bpm) {
      this.startAt = this.startAt + this.beat * beatInterval(this.bpm);
      this.beat = 0;
      this.maxBeats = this.maxBeats === Infinity ? Infinity : this.maxBeats - this.beatsDone;
    }
    this.bpm = next;
  }

  /**
   * Start ticking. `startAt` (audio clock) defaults to "now"; `maxBeats` stops the metronome by
   * itself after that many clicks (count-in).
   */
  start(opts: { startAt?: number; maxBeats?: number } = {}): void {
    this.stop();
    this.startAt = opts.startAt ?? this.ctx.currentTime + 0.05;
    this.beat = 0;
    this.barBeat = 0;
    this.beatsDone = 0;
    this.maxBeats = opts.maxBeats ?? Infinity;
    this.pump();
    this.timer = setInterval(() => this.pump(), TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Play `beats` clicks and report when the "one" after them is due, i.e. when the song should
   * start. `downbeat` is on the audio clock; `done` resolves at that moment.
   */
  countIn(beats: number): { downbeat: number; done: Promise<void> } {
    const startAt = this.ctx.currentTime + 0.08;
    const downbeat = startAt + beats * beatInterval(this.bpm);
    this.start({ startAt, maxBeats: beats });
    const done = new Promise<void>((resolve) => {
      const wait = () => {
        const left = downbeat - this.ctx.currentTime;
        if (left <= 0.002) resolve();
        else setTimeout(wait, Math.max(1, Math.min(left * 1000 - 5, 50)));
      };
      wait();
    });
    return { downbeat, done };
  }

  private pump(): void {
    const iv = beatInterval(this.bpm);
    while (this.beat < this.maxBeats) {
      const time = this.startAt + this.beat * iv;
      if (time > this.ctx.currentTime + LOOKAHEAD_SEC) return;
      if (time >= this.ctx.currentTime - 0.01)
        this.click(time, isAccent(this.barBeat, this.beatsPerBar));
      this.beat++;
      this.barBeat = (this.barBeat + 1) % Math.max(1, this.beatsPerBar);
    }
    this.stop(); // count-in finished
  }

  private click(time: number, accent: boolean): void {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.frequency.value = accent ? 1600 : 1000;
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(this.volume * (accent ? 1 : 0.7), time + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(env).connect(this.out);
    osc.start(time);
    osc.stop(time + 0.06);
    this.scheduled.push({ time, accent });
    if (this.scheduled.length > 64) this.scheduled.shift();
  }
}
