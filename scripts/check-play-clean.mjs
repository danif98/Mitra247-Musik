// Guard for the Google Play edition: fails when the web build or the Android bundle still holds
// anything of the personal edition (downloader code and libraries, its strings, its plugin, the
// share-target intent filter).
//   node scripts/check-play-clean.mjs [path/to/app-play-release.aab|.apk]
// Without an argument only the web build (out/app-play) is checked.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { root } from './lib.mjs';

/** Text that must never appear in the Play edition (matched without regard to case). */
export const FORBIDDEN = [
  'youtube',
  'youtu.be',
  'yt-dlp',
  'ytdlp',
  'ytsearch',
  'ytimg',
  'musikpersonal',
  'musictools',
  'libpython',
  'libffmpeg',
];

/** Native libraries and files of the personal edition, by name. */
export const FORBIDDEN_NAMES = [/libpython/i, /libffmpeg/i, /libytdl/i, /yt-?dlp/i];

export function findForbidden(text) {
  const lower = text.toLowerCase();
  return FORBIDDEN.filter((word) => lower.includes(word));
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function scanFiles(problems, label, base, files, { binary }) {
  for (const file of files) {
    const rel = path.relative(base, file).replaceAll('\\', '/');
    for (const re of FORBIDDEN_NAMES) {
      if (re.test(rel)) problems.push(`${label}: file name ${rel}`);
    }
    if (/\.(png|jpg|webp|wasm|ogg|mp3)$/i.test(rel)) continue;
    if (!binary && !/\.(js|mjs|css|html|json|webmanifest|txt|md|svg|xml)$/i.test(rel)) continue;
    const text = readFileSync(file).toString('latin1');
    for (const word of findForbidden(text)) problems.push(`${label}: "${word}" in ${rel}`);
  }
}

function unpack(pkg, dir) {
  let r = spawnSync('tar', ['-xf', pkg, '-C', dir], { encoding: 'utf8' });
  if (r.status !== 0) r = spawnSync('unzip', ['-q', pkg, '-d', dir], { encoding: 'utf8' });
  return r.status === 0;
}

function main() {
  const problems = [];

  // 1. Web build of the Play edition
  const webDir = path.join(root, 'out', 'app-play');
  if (!existsSync(webDir)) {
    console.error(`Not found: ${webDir}. Run: npm run build:play`);
    process.exit(2);
  }
  scanFiles(problems, 'web', webDir, walk(webDir), { binary: false });

  // 2. Android bundle
  const pkg = process.argv[2];
  if (pkg) {
    if (!existsSync(pkg)) {
      console.error(`Not found: ${pkg}`);
      process.exit(2);
    }
    const dir = path.join(os.tmpdir(), `musik-check-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    if (!unpack(pkg, dir)) {
      console.error('Could not unpack the package (needs tar or unzip).');
      process.exit(2);
    }
    const files = walk(dir);
    // The web assets are checked above; here the native parts: dex code, libraries, manifest.
    const web = ['base/assets/public', 'assets/public'].map((p) => path.join(dir, p));
    const native = files.filter((f) => !web.some((w) => f.startsWith(w)));
    scanFiles(problems, 'android', dir, native, { binary: true });
    const manifests = files.filter((f) => /AndroidManifest\.xml$/.test(f));
    if (manifests.length === 0) problems.push('android: no AndroidManifest.xml in the package');
    for (const m of manifests) {
      const text = readFileSync(m).toString('latin1').replaceAll('\u0000', '');
      if (!text.includes('com.mitra247.musicplayer')) {
        problems.push('android: applicationId com.mitra247.musicplayer not found in the manifest');
      }
      if (text.includes('android.intent.action.SEND')) {
        problems.push('android: the SEND intent filter is still in the manifest');
      }
    }
    rmSync(dir, { recursive: true, force: true });
  }

  if (problems.length > 0) {
    console.error(`\nPlay edition is NOT clean (${problems.length} problem(s)):`);
    for (const p of problems.slice(0, 50)) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`\nPlay edition is clean${pkg ? ` (web + ${path.basename(pkg)})` : ' (web only)'}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
