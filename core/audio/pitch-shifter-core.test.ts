import { beforeAll, describe, expect, it } from 'vitest';
import { dominantFrequency, generateSine, rms } from './analysis';
import { computePitchRatio, semitonesToRatio } from './pitch-math';
import { PitchShifterCore } from './pitch-shifter-core';
import { loadRubberBandWasmNode } from './rubberband/load-node';
import type { RubberBandEngine } from './pitch-math';

const SR = 44100;
let wasm: WebAssembly.Module;

beforeAll(async () => {
  wasm = await loadRubberBandWasmNode();
});

/** Stream a signal through the shifter in 128-frame blocks, like an AudioWorklet would. */
async function run(
  input: Float32Array,
  ratio: number,
  engine: RubberBandEngine,
): Promise<{ out: Float32Array; underruns: number; blocks: number }> {
  const core = await PitchShifterCore.create(wasm, { sampleRate: SR, engine });
  core.setPitchRatio(ratio);
  const q = 128;
  const blocks = Math.floor(input.length / q);
  const out = new Float32Array(blocks * q);
  const inBuf = [new Float32Array(q), new Float32Array(q)];
  const outBuf = [new Float32Array(q), new Float32Array(q)];
  for (let b = 0; b < blocks; b++) {
    inBuf[0]!.set(input.subarray(b * q, (b + 1) * q));
    inBuf[1]!.set(inBuf[0]!);
    core.process(inBuf, outBuf, q);
    out.set(outBuf[0]!, b * q);
  }
  const s = core.stats();
  core.dispose();
  return { out, underruns: s.underruns, blocks: s.blocks };
}

describe('PitchShifterCore (Rubber Band WASM)', () => {
  for (const engine of ['R2', 'R3'] as const) {
    it(`${engine}: 440 Hz sine +12 semitones -> ~880 Hz`, async () => {
      const input = generateSine(440, SR, 3);
      const { out, underruns } = await run(input, semitonesToRatio(12), engine);
      const tail = out.subarray(SR * 1.5, SR * 1.5 + 32768);
      const f = dominantFrequency(tail, SR);
      console.log(`[numeric] core ${engine} +12st: ${f.toFixed(2)} Hz, underruns=${underruns}`);
      expect(rms(tail)).toBeGreaterThan(0.1);
      // R2 has a known ~1% bias on pure low-frequency sines (bin-locked phase vocoder); R3 is exact.
      expect(Math.abs(f / 880 - 1)).toBeLessThan(engine === 'R3' ? 0.002 : 0.02);
      expect(underruns).toBe(0);
    });
  }

  it('R2: -12 semitones -> ~220 Hz', async () => {
    const { out } = await run(generateSine(440, SR, 3), 0.5, 'R2');
    const f = dominantFrequency(out.subarray(SR * 1.5, SR * 1.5 + 32768), SR);
    expect(Math.abs(f / 220 - 1)).toBeLessThan(0.02);
  });

  it('path A extreme: tempo 0.25 and +12st needs ratio 8 (input already 4x slower pitch)', async () => {
    // Browser plays at 0.25x w/o pitch preservation: a 440 Hz tone is heard as 110 Hz.
    // Rubber Band ratio 2^(12/12)/0.25 = 8 must bring it to 880 Hz.
    const ratio = computePitchRatio('A', 0.25, 12);
    expect(ratio).toBeCloseTo(8, 10);
    const { out } = await run(generateSine(110, SR, 3), ratio, 'R2');
    const f = dominantFrequency(out.subarray(SR * 1.5, SR * 1.5 + 32768), SR);
    console.log(`[numeric] core R2 ratio 8: ${f.toFixed(2)} Hz`);
    expect(Math.abs(f / 880 - 1)).toBeLessThan(0.03);
  });

  it('keeps ratio 1 transparent', async () => {
    const { out } = await run(generateSine(440, SR, 2), 1, 'R2');
    const f = dominantFrequency(out.subarray(SR, SR + 32768), SR);
    expect(Math.abs(f - 440)).toBeLessThan(1);
  });
});
