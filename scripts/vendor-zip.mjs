// Build vendor.zip: production node_modules of the server (pure JS only), OUTSIDE the deploy repo.
// Output: out/vendor.zip (override with MUSIK_VENDOR_OUT). Upload it manually to the server and extract
// it once in the app root; re-create it only when server dependencies change.
// Usage: node scripts/vendor-zip.mjs
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { formatBytes, listFiles, root, runNpm } from './lib.mjs';
import { scanNodeModules } from './check-pure-js.mjs';
import { zipDirectory } from './zip.mjs';

const work = path.join(root, 'out', 'vendor-work');
const outFile = path.resolve(process.env.MUSIK_VENDOR_OUT || path.join(root, 'out', 'vendor.zip'));
const deployDir = path.resolve(
  process.env.MUSIK_DEPLOY_DIR || path.join(root, '..', 'musik-deploy'),
);

if (path.resolve(outFile).startsWith(deployDir + path.sep)) {
  console.error('vendor.zip must be written outside the deploy repo.');
  process.exit(1);
}

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

// Use the production manifest + lockfile of the deploy folder when present, else the server's own.
const deployPkg = path.join(deployDir, 'package.json');
const deployLock = path.join(deployDir, 'package-lock.json');
const useDeploy = existsSync(deployPkg) && existsSync(deployLock);
copyFileSync(
  useDeploy ? deployPkg : path.join(root, 'server', 'package.json'),
  path.join(work, 'package.json'),
);
if (useDeploy) copyFileSync(deployLock, path.join(work, 'package-lock.json'));

const installArgs = useDeploy ? ['ci'] : ['install'];
runNpm([...installArgs, '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
  cwd: work,
  stdio: 'pipe',
});

const nm = path.join(work, 'node_modules');
mkdirSync(nm, { recursive: true });
const { offenders, count } = scanNodeModules(nm);
if (offenders.length) {
  console.error('FAIL: native bindings in production dependencies:');
  for (const o of offenders) console.error(`  - ${o}`);
  process.exit(1);
}
// Marker file so the archive is never empty and records how it was built.
writeFileSync(
  path.join(nm, '.musik-vendor.json'),
  JSON.stringify({ builtWithNode: process.version, platform: process.platform, packages: count }) +
    '\n',
);

mkdirSync(path.dirname(outFile), { recursive: true });
const files = zipDirectory(nm, outFile, 'node_modules');
console.log(`vendor.zip: ${outFile}`);
console.log(`Size: ${formatBytes(statSync(outFile).size)}  (${files} files, ${count} packages)`);
console.log(
  `Built with Node ${process.version}. Must match the Node version selected in cPanel "Setup Node.js App".`,
);
console.log(
  `Pure-JS check: OK (no binding.gyp / .node / prebuilds). Archive entries: ${listFiles(nm).length}`,
);
console.log(
  'Upload manually (not via git) and extract in the app root so node_modules/ sits next to package.json.',
);
