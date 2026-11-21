// Fails when a server dependency ships a native binding (binding.gyp, *.node, prebuilds/).
// The cPanel shared host cannot build or load native modules, so the server must be pure JS.
//
// Usage:
//   node scripts/check-pure-js.mjs                 # server production dependency closure in ./node_modules
//   node scripts/check-pure-js.mjs <node_modules>  # scan a whole node_modules folder (e.g. vendor work dir)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './lib.mjs';

/** Scan one package directory (recursively, skipping nested node_modules). Returns offending paths. */
export function scanPackageDir(dir) {
  const offenders = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        if (entry.name === 'prebuilds') offenders.push(full);
        else walk(full);
      } else if (entry.name === 'binding.gyp' || entry.name.endsWith('.node')) {
        offenders.push(full);
      }
    }
  };
  walk(dir);
  const pkgFile = path.join(dir, 'package.json');
  if (existsSync(pkgFile)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
      if (pkg.gypfile === true) offenders.push(`${pkgFile} (gypfile: true)`);
    } catch {
      /* ignore unreadable package.json */
    }
  }
  return offenders;
}

/** Resolve the directory of dependency `name` as Node would, starting from `fromDir`. */
function resolvePackageDir(name, fromDir, stopAt) {
  let dir = fromDir;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', name);
    if (existsSync(path.join(candidate, 'package.json'))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir || dir === stopAt) {
      // also try the stop directory itself
      const last = path.join(stopAt, 'node_modules', name);
      return existsSync(path.join(last, 'package.json')) ? last : null;
    }
    dir = parent;
  }
}

/** Production dependency closure (directories) of the package at `pkgDir`, resolved under `topDir`. */
export function dependencyClosure(pkgDir, topDir = root) {
  const seen = new Map();
  const missing = [];
  const visit = (dir) => {
    const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.optionalDependencies ?? {}) };
    for (const name of Object.keys(deps)) {
      const resolved = resolvePackageDir(name, dir, topDir);
      if (!resolved) {
        missing.push(name);
        continue;
      }
      if (!seen.has(resolved)) {
        seen.set(resolved, name);
        visit(resolved);
      }
    }
  };
  visit(pkgDir);
  return { dirs: [...seen.keys()], missing };
}

/** Scan every package inside a node_modules folder (handles @scope/* and nested node_modules). */
export function scanNodeModules(nmDir) {
  const offenders = [];
  let count = 0;
  const visitNm = (nm) => {
    if (!existsSync(nm)) return;
    for (const entry of readdirSync(nm, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const full = path.join(nm, entry.name);
      const pkgDirs = entry.name.startsWith('@')
        ? readdirSync(full, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => path.join(full, e.name))
        : [full];
      for (const pkgDir of pkgDirs) {
        count++;
        offenders.push(...scanPackageDir(pkgDir));
        visitNm(path.join(pkgDir, 'node_modules'));
      }
    }
  };
  visitNm(nmDir);
  return { offenders, count };
}

function main() {
  const arg = process.argv[2];
  let offenders = [];
  let count = 0;
  if (arg) {
    ({ offenders, count } = scanNodeModules(path.resolve(arg)));
  } else {
    const { dirs, missing } = dependencyClosure(path.join(root, 'server'));
    if (missing.length) {
      console.error(`Cannot resolve server dependencies (run npm install): ${missing.join(', ')}`);
      process.exit(1);
    }
    count = dirs.length;
    for (const d of dirs) offenders.push(...scanPackageDir(d));
  }
  if (offenders.length) {
    console.error('FAIL: native bindings found (server must be pure JS):');
    for (const o of offenders) console.error(`  - ${o}`);
    process.exit(1);
  }
  console.log(
    `OK: ${count} server dependenc${count === 1 ? 'y' : 'ies'} checked, no native bindings.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
