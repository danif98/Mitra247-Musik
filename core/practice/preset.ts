/** Per-song practice preset (tempo, key, loop, minus one, EQ). Pure helpers, unit-tested. */
import { clampSemitone, clampTempo } from '../audio/pitch-math';
import {
  DEFAULT_MINUS_ONE,
  clampMinusOneParams,
  paramsEqual,
  type MinusOneParams,
} from '../audio/minus-one';

export const EQ_BANDS = 5;
export const EQ_MAX_DB = 12;

export interface Preset {
  tempo: number;
  semitone: number;
  minusOne: boolean;
  loopA: number | null;
  loopB: number | null;
  /** Gain in dB for each EQ band (length EQ_BANDS). */
  eq: number[];
  /** Minus One mode and manual controls. */
  mo: MinusOneParams;
}

export function defaultPreset(): Preset {
  return {
    tempo: 1,
    semitone: 0,
    minusOne: false,
    loopA: null,
    loopB: null,
    eq: new Array<number>(EQ_BANDS).fill(0),
    mo: { ...DEFAULT_MINUS_ONE },
  };
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function maybeTime(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

/** Accepts anything read from storage and returns a valid preset (bad fields fall back). */
export function normalizePreset(raw: unknown): Preset {
  const d = defaultPreset();
  if (typeof raw !== 'object' || raw === null) return d;
  const r = raw as Record<string, unknown>;
  const eqIn = Array.isArray(r['eq']) ? (r['eq'] as unknown[]) : [];
  const loopA = maybeTime(r['loopA']);
  const loopB = maybeTime(r['loopB']);
  const validLoop = loopA !== null && loopB !== null && loopB > loopA;
  return {
    tempo: clampTempo(num(r['tempo'], d.tempo)),
    semitone: Math.round(clampSemitone(num(r['semitone'], d.semitone))),
    minusOne: r['minusOne'] === true,
    loopA: validLoop ? loopA : null,
    loopB: validLoop ? loopB : null,
    eq: d.eq.map((_, i) => Math.min(EQ_MAX_DB, Math.max(-EQ_MAX_DB, num(eqIn[i], 0)))),
    mo: clampMinusOneParams(
      typeof r['mo'] === 'object' && r['mo'] !== null ? (r['mo'] as Partial<MinusOneParams>) : null,
    ),
  };
}

export function isDefaultPreset(p: Preset): boolean {
  const d = defaultPreset();
  return (
    p.tempo === d.tempo &&
    p.semitone === d.semitone &&
    p.minusOne === d.minusOne &&
    p.loopA === null &&
    p.loopB === null &&
    p.eq.every((g) => g === 0) &&
    paramsEqual(p.mo, d.mo)
  );
}

export function presetsEqual(a: Preset, b: Preset): boolean {
  return (
    a.tempo === b.tempo &&
    a.semitone === b.semitone &&
    a.minusOne === b.minusOne &&
    a.loopA === b.loopA &&
    a.loopB === b.loopB &&
    a.eq.length === b.eq.length &&
    a.eq.every((g, i) => g === b.eq[i]) &&
    paramsEqual(a.mo, b.mo)
  );
}
