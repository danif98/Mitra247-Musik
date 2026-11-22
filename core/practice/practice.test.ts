import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loopJumpTarget, isActive, setA, setB, insideLoop, NO_LOOP } from './loop';
import { defaultPreset, isDefaultPreset, normalizePreset, presetsEqual } from './preset';
import { EQ_BAND_DEFS, biquadMagnitudeDb, clampEqGain, eqResponseDb } from '../audio/eq';
import { Metronome, beatInterval, beatTimes, clampBpm, isAccent } from '../audio/metronome';

describe('loop A-B', () => {
  it('needs both points and a minimum length', () => {
    expect(isActive(NO_LOOP)).toBe(false);
    expect(isActive({ a: 1, b: 1.2 })).toBe(false);
    expect(isActive({ a: 1, b: 2 })).toBe(true);
  });
  it('setB without A starts the loop at 0:00; too-short B is ignored', () => {
    expect(setB(NO_LOOP, 10)).toEqual({ a: 0, b: 10 });
    const loop = { a: 5, b: 9 };
    expect(setB(loop, 5.2)).toBe(loop);
  });
  it('setA drops a B that would be before the new A', () => {
    expect(setA({ a: 2, b: 8 }, 4)).toEqual({ a: 4, b: 8 });
    expect(setA({ a: 2, b: 8 }, 8)).toEqual({ a: 8, b: null });
    expect(setA(NO_LOOP, -3)).toEqual({ a: 0, b: null });
  });
  it('jumps back to A at B and only then', () => {
    const loop = { a: 10, b: 20 };
    expect(loopJumpTarget(loop, 15)).toBeNull();
    expect(loopJumpTarget(loop, 19.98)).toBe(10);
    expect(loopJumpTarget(loop, 20.5)).toBe(10);
    expect(loopJumpTarget(loop, 25)).toBeNull(); // seeked out of the loop on purpose
    expect(loopJumpTarget(NO_LOOP, 99)).toBeNull();
    expect(loopJumpTarget({ a: 10, b: null }, 99)).toBeNull();
  });
  it('insideLoop tolerates small overshoot', () => {
    expect(insideLoop({ a: 10, b: 20 }, 20.1)).toBe(true);
    expect(insideLoop({ a: 10, b: 20 }, 25)).toBe(false);
    expect(insideLoop({ a: 10, b: 20 }, 3)).toBe(false);
  });
});

describe('preset', () => {
  it('default preset is flat and recognised as default', () => {
    const d = defaultPreset();
    expect(d.eq).toEqual([0, 0, 0, 0, 0]);
    expect(isDefaultPreset(d)).toBe(true);
    expect(isDefaultPreset({ ...d, tempo: 0.75 })).toBe(false);
  });
  it('normalizePreset clamps, validates and survives junk', () => {
    expect(normalizePreset(null)).toEqual(defaultPreset());
    expect(normalizePreset('x')).toEqual(defaultPreset());
    const p = normalizePreset({
      tempo: 9,
      semitone: 30,
      minusOne: 'yes',
      loopA: 5,
      loopB: 3,
      eq: [20, -20, 'a', 1.5],
    });
    expect(p.tempo).toBe(2);
    expect(p.semitone).toBe(12);
    expect(p.minusOne).toBe(false);
    expect(p.loopA).toBeNull();
    expect(p.loopB).toBeNull();
    expect(p.eq).toEqual([12, -12, 0, 1.5, 0]);
    const ok = normalizePreset({ tempo: 0.8, semitone: -2.4, minusOne: true, loopA: 3, loopB: 9 });
    expect(ok).toMatchObject({ tempo: 0.8, semitone: -2, minusOne: true, loopA: 3, loopB: 9 });
  });
  it('presetsEqual compares every field', () => {
    const a = defaultPreset();
    expect(presetsEqual(a, defaultPreset())).toBe(true);
    expect(presetsEqual(a, { ...a, eq: [0, 0, 1, 0, 0] })).toBe(false);
    expect(presetsEqual(a, { ...a, loopA: 1, loopB: 4 })).toBe(false);
  });
});

describe('equalizer response (RBJ biquads)', () => {
  const SR = 48000;
  it('peaking bands give their full gain at the centre frequency', () => {
    for (const i of [1, 2, 3]) {
      const band = EQ_BAND_DEFS[i]!;
      expect(biquadMagnitudeDb(band, 9, band.frequency, SR)).toBeCloseTo(9, 3);
      expect(biquadMagnitudeDb(band, -9, band.frequency, SR)).toBeCloseTo(-9, 3);
    }
  });
  it('shelves reach the full gain well inside the shelf and about half at the corner', () => {
    const low = EQ_BAND_DEFS[0]!;
    const high = EQ_BAND_DEFS[4]!;
    expect(biquadMagnitudeDb(low, 12, 20, SR)).toBeCloseTo(12, 0);
    expect(biquadMagnitudeDb(low, 12, low.frequency, SR)).toBeCloseTo(6, 0);
    expect(biquadMagnitudeDb(high, -12, 20000, SR)).toBeLessThan(-10);
    expect(biquadMagnitudeDb(high, 12, high.frequency, SR)).toBeCloseTo(6, 0);
  });
  it('flat settings are transparent and gains are clamped', () => {
    for (const f of [30, 200, 1000, 8000, 18000])
      expect(eqResponseDb([0, 0, 0, 0, 0], f, SR)).toBeCloseTo(0, 6);
    expect(clampEqGain(40)).toBe(12);
    expect(clampEqGain(-40)).toBe(-12);
    expect(clampEqGain(Number.NaN)).toBe(0);
  });
  it('a band mostly leaves distant frequencies alone', () => {
    expect(Math.abs(eqResponseDb([0, 0, 12, 0, 0], 100, SR))).toBeLessThan(1.5);
    expect(Math.abs(eqResponseDb([0, 0, 12, 0, 0], 12000, SR))).toBeLessThan(1.5);
  });
});

describe('metronome timing', () => {
  it('helpers', () => {
    expect(beatInterval(120)).toBeCloseTo(0.5, 9);
    expect(clampBpm(5)).toBe(30);
    expect(clampBpm(999)).toBe(240);
    expect(clampBpm(Number.NaN)).toBe(100);
    expect(beatTimes(1, 60, 3)).toEqual([1, 2, 3]);
    expect([0, 1, 2, 3, 4].map((i) => isAccent(i, 4))).toEqual([true, false, false, false, true]);
    expect(isAccent(2, 1)).toBe(true);
  });

  class FakeParam {
    value = 0;
    setValueAtTime() {}
    exponentialRampToValueAtTime() {}
  }
  class FakeCtx {
    currentTime = 0;
    started: number[] = [];
    createGain() {
      return { gain: new FakeParam(), connect: (n: unknown) => n };
    }
    createOscillator() {
      const started = this.started;
      return {
        frequency: new FakeParam(),
        connect: (n: unknown) => n,
        start: (t: number) => started.push(t),
        stop() {},
      };
    }
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function run(ctx: FakeCtx, seconds: number) {
    for (let t = 0; t < seconds * 1000; t += 25) {
      ctx.currentTime += 0.025;
      vi.advanceTimersByTime(25);
    }
  }

  it('schedules evenly spaced clicks with an accent on beat one', () => {
    const ctx = new FakeCtx();
    const m = new Metronome(ctx as unknown as BaseAudioContext, {} as AudioNode);
    m.setBpm(120);
    m.beatsPerBar = 3;
    m.start({ startAt: 0.1 });
    run(ctx, 3);
    m.stop();
    expect(ctx.started.length).toBeGreaterThanOrEqual(6);
    for (let i = 1; i < ctx.started.length; i++) {
      expect(ctx.started[i]! - ctx.started[i - 1]!).toBeCloseTo(0.5, 6);
    }
    expect(m.scheduled.slice(0, 7).map((c) => c.accent)).toEqual([
      true,
      false,
      false,
      true,
      false,
      false,
      true,
    ]);
  });

  it('changing the tempo while running keeps ticking at the new rate', () => {
    const ctx = new FakeCtx();
    const m = new Metronome(ctx as unknown as BaseAudioContext, {} as AudioNode);
    m.setBpm(60);
    m.start({ startAt: 0.1 });
    run(ctx, 2);
    m.setBpm(120);
    run(ctx, 2);
    m.stop();
    const gaps = ctx.started.slice(1).map((t, i) => t - ctx.started[i]!);
    expect(gaps.some((g) => Math.abs(g - 1) < 1e-6)).toBe(true); // before the change
    expect(gaps.filter((g) => Math.abs(g - 0.5) < 1e-6).length).toBeGreaterThanOrEqual(2); // after
    expect(Math.max(...gaps)).toBeLessThanOrEqual(1 + 1e-6); // no gap while re-basing
    // the accent pattern continues through the change (every 4th click)
    const accents = m.scheduled.map((c) => c.accent);
    accents.forEach((a, i) => expect(a).toBe(i % 4 === 0));
  });

  it('count-in plays N clicks, stops itself and reports the downbeat', async () => {
    const ctx = new FakeCtx();
    const m = new Metronome(ctx as unknown as BaseAudioContext, {} as AudioNode);
    m.setBpm(120);
    const { downbeat, done } = m.countIn(4);
    let resolved = false;
    void done.then(() => (resolved = true));
    run(ctx, 1);
    expect(resolved).toBe(false);
    run(ctx, 1.5);
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(true);
    expect(ctx.started).toHaveLength(4);
    expect(downbeat).toBeCloseTo(ctx.started[0]! + 4 * 0.5, 6);
    expect(m.running).toBe(false);
  });
});
