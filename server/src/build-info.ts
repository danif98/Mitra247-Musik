import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface BuildInfo {
  version: string;
  commit: string | null;
  builtAt: string | null;
}

/** Reads build-info.json (written by scripts/build.mjs next to dist/). Falls back to "dev". */
export function readBuildInfo(dir: string = __dirname): BuildInfo {
  for (const candidate of [
    path.join(dir, 'build-info.json'),
    path.join(dir, '..', 'build-info.json'),
  ]) {
    try {
      const raw = JSON.parse(readFileSync(candidate, 'utf8')) as Partial<BuildInfo>;
      return {
        version: String(raw.version ?? 'dev'),
        commit: raw.commit ?? null,
        builtAt: raw.builtAt ?? null,
      };
    } catch {
      /* try next */
    }
  }
  return { version: 'dev', commit: null, builtAt: null };
}
