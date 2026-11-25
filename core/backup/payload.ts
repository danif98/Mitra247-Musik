/**
 * Backup of the practice data (per-song presets and a few settings) that is kept in the user's own
 * Google Drive app folder. Pure helpers, unit-tested. Songs themselves are never part of it.
 */
import { normalizePreset, type Preset } from '../practice/preset';

export const BACKUP_VERSION = 1;
/** Name of the file in the Drive app folder. */
export const BACKUP_FILE = 'musik-backup.json';

/** localStorage keys that are copied. Never anything device specific, and never secrets. */
export const SETTING_KEYS = ['musik.engine', 'musik.metronome', 'musik.playmode'] as const;

const MAX_PRESETS = 5000;
const MAX_SIG = 300;
const MAX_VALUE = 2000;

export interface BackupPreset {
  /** Song signature (title + size), see `songSignature`. */
  sig: string;
  /** ms since epoch when the preset was saved. */
  savedAt: number;
  preset: Preset;
}

export interface BackupData {
  v: number;
  /** ms since epoch when this backup was written. */
  updatedAt: number;
  settings: Record<string, string>;
  presets: BackupPreset[];
}

export function emptyBackup(now = Date.now()): BackupData {
  return { v: BACKUP_VERSION, updatedAt: now, settings: {}, presets: [] };
}

/** Reads a backup file; anything wrong (not JSON, wrong shape, too new) gives null. */
export function parseBackup(text: string | null | undefined): BackupData | null {
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r['v'] !== 'number' || r['v'] > BACKUP_VERSION || r['v'] < 1) return null;
  const settings: Record<string, string> = {};
  if (typeof r['settings'] === 'object' && r['settings'] !== null) {
    for (const key of SETTING_KEYS) {
      const value = (r['settings'] as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.length <= MAX_VALUE) settings[key] = value;
    }
  }
  const presets: BackupPreset[] = [];
  if (Array.isArray(r['presets'])) {
    for (const item of r['presets'] as unknown[]) {
      if (presets.length >= MAX_PRESETS) break;
      if (typeof item !== 'object' || item === null) continue;
      const p = item as Record<string, unknown>;
      const sig = p['sig'];
      if (typeof sig !== 'string' || sig.length === 0 || sig.length > MAX_SIG) continue;
      const savedAt =
        typeof p['savedAt'] === 'number' && Number.isFinite(p['savedAt']) ? p['savedAt'] : 0;
      presets.push({ sig, savedAt, preset: normalizePreset(p['preset']) });
    }
  }
  const updatedAt =
    typeof r['updatedAt'] === 'number' && Number.isFinite(r['updatedAt']) ? r['updatedAt'] : 0;
  return { v: BACKUP_VERSION, updatedAt, settings, presets };
}

export function serializeBackup(data: BackupData): string {
  return JSON.stringify(data);
}

/**
 * Merges this device's data with the backup. For each song the preset saved last wins. For
 * settings the value on this device wins, and a missing one is filled from the backup (so a new
 * phone takes over the old settings, while a phone that was set up keeps its own).
 */
export function mergeBackups(
  local: BackupData,
  remote: BackupData | null,
  now = Date.now(),
): BackupData {
  if (!remote) return { ...local, updatedAt: now };
  const bySig = new Map<string, BackupPreset>();
  for (const item of [...remote.presets, ...local.presets]) {
    const have = bySig.get(item.sig);
    if (!have || item.savedAt >= have.savedAt) bySig.set(item.sig, item);
  }
  return {
    v: BACKUP_VERSION,
    updatedAt: now,
    settings: { ...remote.settings, ...local.settings },
    presets: [...bySig.values()].sort((a, b) => a.sig.localeCompare(b.sig)),
  };
}

/** True when two backups hold the same data (the write time is ignored). */
export function sameBackupData(a: BackupData | null, b: BackupData | null): boolean {
  if (!a || !b) return a === b;
  const key = (d: BackupData) =>
    JSON.stringify({
      s: Object.entries(d.settings).sort(([x], [y]) => x.localeCompare(y)),
      p: [...d.presets].sort((x, y) => x.sig.localeCompare(y.sig)),
    });
  return key(a) === key(b);
}
