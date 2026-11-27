import { beforeAll, describe, expect, it } from 'vitest';
import { dominantFrequency, generateSine, rms } from './analysis';
import {
  formatKey,
  formatTempoPercent,
  practiceFileName,
  sanitizeFileName,
  stretchOffline,
} from './export';
import { loadRubberBandWasmNode } from './rubberband/load-node';
import type { RubberBandEngine } from './pitch-math';

const SR = 44100;
let wasm: WebAssembly.Module;

beforeAll(async () => {
  wasm = await loadRubberBandWasmNode();
});

describe('practiceFileName', () => {
  it('follows the requested format', () => {
    expect(practiceFileName('Idol', 'Yoasobi', 1, 2)).toBe('Idol - Yoasobi [Tempo 100 - Key +2]');
  });

  it('shows tempo as a percentage and a negative key with its sign', () => {
    expect(practiceFileName('Lagu', 'Band', 0.75, -3)).toBe('Lagu - Band [Tempo 75 - Key -3]');
    expect(practiceFileName('Lagu', 'Band', 1.25, 0)).toBe('Lagu - Band [Tempo 125 - Key 0]');
  });

  it('leaves out the artist when there is none', () => {
    expect(practiceFileName('Idol', undefined, 1, 2)).toBe('Idol [Tempo 100 - Key +2]');
    expect(practiceFileName('Idol', '  ', 1, 2)).toBe('Idol [Tempo 100 - Key +2]');
  });

  it('removes characters a file name cannot hold', () => {
    expect(practiceFileName('A/B: C?', 'D*E', 1, 0)).toBe('A B C - D E [Tempo 100 - Key 0]');
  });

  it('formats the parts', () => {
    expect(formatKey(2)).toBe('+2');
    expect(formatKey(-1)).toBe('-1');
    expect(formatKey(0)).toBe('0');
    expect(formatTempoPercent(0.85)).toBe('85');
  });

  it('sanitizeFileName trims and limits the length', () => {
    expect(sanitizeFileName('  ..hidden  ')).toBe('hidden');
    expect(sanitizeFileName('x'.repeat(400)).length).toBeLessThanOrEqual(150);
  });
});

describe('stretchOffline', () => {
  const tone = (seconds: number) => {
    const t = generateSine(440, SR, seconds, 0.5);
    return [t, t.slice()];
  };

  it('returns the input untouched when nothing changes', async () => {
    const input = tone(1);
    expect(await stretchOffline(wasm, input, SR, 1, 0, 'R2')).toBe(input);
  });

  for (const engine of ['R2', 'R3'] as RubberBandEngine[]) {
    it(`${engine}: half tempo doubles the length and keeps the pitch`, async () => {
      const out = await stretchOffline(wasm, tone(3), SR, 0.5, 0, engine);
      expect(out[0]!.length / SR).toBeGreaterThan(5.8);
      expect(out[0]!.length / SR).toBeLessThan(6.2);
      const mid = out[0]!.subarray(SR, SR * 3);
      expect(Math.abs(dominantFrequency(mid, SR) - 440)).toBeLessThan(5);
      expect(rms(mid)).toBeGreaterThan(0.25);
    });

    it(`${engine}: +12 semitones doubles the pitch and keeps the length`, async () => {
      const out = await stretchOffline(wasm, tone(3), SR, 1, 12, engine);
      expect(Math.abs(out[0]!.length / SR - 3)).toBeLessThan(0.1);
      const mid = out[0]!.subarray(SR, SR * 2);
      expect(Math.abs(dominantFrequency(mid, SR) - 880)).toBeLessThan(8);
    });
  }

  it('tempo and key together', async () => {
    const out = await stretchOffline(wasm, tone(4), SR, 1.5, -12, 'R3');
    expect(Math.abs(out[0]!.length / SR - 4 / 1.5)).toBeLessThan(0.15);
    const mid = out[0]!.subarray(SR / 2, SR * 2);
    expect(Math.abs(dominantFrequency(mid, SR) - 220)).toBeLessThan(4);
  });

  it('reports progress and can be cancelled', async () => {
    const seen: number[] = [];
    await stretchOffline(wasm, tone(8), SR, 0.8, 1, 'R2', (f) => seen.push(f));
    expect(seen.length).toBeGreaterThan(2);
    expect(Math.max(...seen)).toBeLessThanOrEqual(1);
    const ctl = new AbortController();
    ctl.abort();
    await expect(
      stretchOffline(wasm, tone(8), SR, 0.8, 1, 'R2', undefined, ctl.signal),
    ).rejects.toMatchObject({ code: 'cancelled' });
  });
});
