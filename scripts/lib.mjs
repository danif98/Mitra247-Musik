// Shared helpers for build/deploy scripts. Cross-platform: no shell strings, only path.join + spawn.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Run a command (no shell). Throws on non-zero exit. */
export function run(command, args, options = {}) {
  const res = spawnSync(command, args, { stdio: 'inherit', shell: false, ...options });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${res.status}`);
  }
}

/** Run a Node-based CLI entry (e.g. vite, tsc) with the current Node binary. */
export function runNode(entry, args, options = {}) {
  run(process.execPath, [entry, ...args], options);
}

/** Resolve the npm CLI entry script so we can call it with node (works on Windows, no .cmd needed). */
export function npmCliEntry() {
  if (process.env.npm_execpath && /npm-cli\.js$/.test(process.env.npm_execpath)) {
    return process.env.npm_execpath;
  }
  const candidates = [
    path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(
      path.dirname(process.execPath),
      '..',
      'lib',
      'node_modules',
      'npm',
      'bin',
      'npm-cli.js',
    ),
  ];
  const found = candidates.find((c) => existsSync(c));
  if (!found) throw new Error('Cannot locate npm-cli.js next to the Node binary.');
  return found;
}

export function runNpm(args, options = {}) {
  runNode(npmCliEntry(), args, options);
}

export function gitInfo() {
  const git = (args) => {
    const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', shell: false });
    return r.status === 0 ? r.stdout.trim() : null;
  };
  const commit = git(['rev-parse', '--short', 'HEAD']);
  const dirty = git(['status', '--porcelain']);
  return { commit, dirty: dirty ? dirty.length > 0 : false };
}

/** Total size in bytes of all files below dir. */
export function dirSize(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSize(full) : statSync(full).size;
  }
  return total;
}

export function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${bytes} B`;
}

/** Recursively list files (relative, forward-slash paths). */
export function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}
