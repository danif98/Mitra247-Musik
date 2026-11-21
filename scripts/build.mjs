// Build the PWA and the server skeleton into out/.
//   out/app/     static PWA (precache service worker included)
//   out/server/  compiled server (CommonJS) + build-info.json
// Usage: node scripts/build.mjs
import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { dirSize, formatBytes, gitInfo, listFiles, readJson, root, runNode } from './lib.mjs';

const out = path.join(root, 'out');
const pkg = readJson(path.join(root, 'package.json'));
const PWA_BUDGET = 10 * 1024 * 1024;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// 1. PWA (vite writes to out/app, see app-pwa/vite.config.ts)
console.log('\n== Building PWA ==');
runNode(path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), ['build'], {
  cwd: path.join(root, 'app-pwa'),
});

// 2. Server (tsc -> server/dist -> out/server)
console.log('\n== Building server ==');
const serverDist = path.join(root, 'server', 'dist');
rmSync(serverDist, { recursive: true, force: true });
runNode(
  path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
  ['-p', 'server/tsconfig.json'],
  {
    cwd: root,
  },
);
cpSync(serverDist, path.join(out, 'server'), { recursive: true });

// 3. Build info
const { commit, dirty } = gitInfo();
const info = {
  version: pkg.version,
  commit: commit ? (dirty ? `${commit}-dirty` : commit) : null,
  builtAt: new Date().toISOString(),
};
writeFileSync(path.join(out, 'server', 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
writeFileSync(path.join(out, 'app', 'version.json'), JSON.stringify(info) + '\n');

// 4. Report sizes
console.log('\n== Output ==');
const appSize = dirSize(path.join(out, 'app'));
const wasmFiles = listFiles(path.join(out, 'app')).filter((f) => f.endsWith('.wasm'));
for (const f of wasmFiles) {
  console.log(`WASM: ${f}  ${formatBytes(statSync(path.join(out, 'app', f)).size)}`);
}
console.log(`PWA total: ${formatBytes(appSize)} (budget ${formatBytes(PWA_BUDGET)})`);
console.log(`Server total: ${formatBytes(dirSize(path.join(out, 'server')))}`);
console.log(`Version: ${info.version} (${info.commit ?? 'no git commit'})`);
if (appSize > PWA_BUDGET) {
  console.error('PWA exceeds the 10 MB budget.');
  process.exit(1);
}
if (!existsSync(path.join(out, 'app', 'sw.js')) || !readdirSync(out).includes('server')) {
  console.error('Build output incomplete.');
  process.exit(1);
}
