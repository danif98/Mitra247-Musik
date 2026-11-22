import { beforeAll, describe, expect, it } from 'vitest';
import { generateSine } from './analysis';
import { PitchShifterCore } from './pitch-shifter-core';
import { loadRubberBandWasmNode } from './rubberband/load-node';
import type { RubberBandEngine } from './pitch-math';

const SR = 48000;
let wasm: WebAssembly.Module;
beforeAll(async () => {
  wasm = await loadRubberBandWasmNode();
});

function noise(n: number): Float32Array {
  let x = 123456789;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    x = (1664525 * x + 1013904223) >>> 0;
    out[i] = (x / 0xffffffff - 0.5) * 0.5;
  }
  return out;
}

async function run(
  input: Float32Array,
  ratioAt: (block: number) => number,
  engine: RubberBandEngine,
  allowBypass: boolean,
) {
  const core = await PitchShifterCore.create(wasm, { sampleRate: SR, engine, allowBypass });
  const q = 128;
  const blocks = Math.floor(input.length / q);
  const out = new Float32Array(blocks * q);
  const modes: string[] = [];
  const ib = [new Float32Array(q), new Float32Array(q)];
  const ob = [new Float32Array(q), new Float32Array(q)];
  for (let b = 0; b < blocks; b++) {
    core.setPitchRatio(ratioAt(b));
    ib[0]!.set(input.subarray(b * q, (b + 1) * q));
    ib[1]!.set(ib[0]!);
    core.process(ib, ob, q);
    out.set(ob[0]!, b * q);
    modes.push(core.stats().mode);
  }
  const stats = core.stats();
  core.dispose();
  return { out, modes, stats };
}

function bestLag(x: Float32Array, y: Float32Array, from: number, len: number): number {
  let best = 0;
  let bestScore = -Infinity;
  for (let lag = 0; lag < 4000; lag++) {
    let s = 0;
    for (let i = from; i < from + len; i++) s += x[i - lag]! * y[i]!;
    if (s > bestScore) {
      bestScore = s;
      best = lag;
    }
  }
  return best;
}

describe.each(['R2', 'R3'] as const)('bypass at ratio 1 (%s)', (engine) => {
  it('dry path is time-aligned with the Rubber Band path', async () => {
    const input = noise(SR * 2);
    const shifted = await run(input, () => 1, engine, false);
    const bypassed = await run(input, () => 1, engine, true);
    expect(bypassed.stats.mode).toBe('bypass');
    const from = SR;
    const lagShift = bestLag(input, shifted.out, from, 8000);
    const lagBypass = bestLag(input, bypassed.out, from, 8000);
    expect(Math.abs(lagShift - lagBypass)).toBeLessThanOrEqual(1);
  });

  it('switching between ratio 1 and 1.5 has no clicks and restarts cleanly', async () => {
    const input = generateSine(440, SR, 6, 0.5);
    // Smooth (log-domain, 250 ms) ratio changes like the worklet does; abrupt jumps click by themselves.
    const target = (b: number) => (Math.floor((b * 128) / SR) % 2 === 0 ? 1 : 1.5);
    let cur = 1;
    const smooth = (b: number) => {
      const t = target(b);
      cur = Math.exp(
        Math.log(cur) + (Math.log(t) - Math.log(cur)) * (1 - Math.exp(-128 / SR / 0.06)),
      );
      if (Math.abs(Math.log(t / cur)) < 1e-3) cur = t;
      return cur;
    };
    const ratioAt = (b: number) => smooth(b);
    const base = await run(input, ratioAt, engine, false);
    cur = 1;
    const { out, modes } = await run(input, ratioAt, engine, true);
    let baseJump = 0;
    for (let i = SR / 2 + 1; i < base.out.length; i++)
      baseJump = Math.max(baseJump, Math.abs(base.out[i]! - base.out[i - 1]!));
    expect(modes).toContain('bypass');
    expect(modes).toContain('shift');
    let maxJump = 0;
    for (let i = SR / 2 + 1; i < out.length; i++)
      maxJump = Math.max(maxJump, Math.abs(out[i]! - out[i - 1]!));
    // 660 Hz at amplitude 0.5 has a max step of ~0.043; allow some headroom for crossfade seams.
    expect(maxJump).toBeLessThan(Math.max(0.15, baseJump * 1.5));
  });
});
