// Build the unpacked Chrome extension into ext-chrome/dist (or dist-test with --test).
// Usage: node ext-chrome/build.mjs [--test]
import { build } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const isTest = process.argv.includes('--test');
const outDir = path.join(here, isTest ? 'dist-test' : 'dist');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const common = {
  configFile: false,
  root: here,
  logLevel: 'warn',
  define: { __TEST__: JSON.stringify(isTest) },
};

// 1. Popup (HTML + Svelte)
await build({
  ...common,
  base: './',
  plugins: [svelte()],
  build: {
    outDir,
    emptyOutDir: false,
    target: 'es2022',
    rollupOptions: { input: path.join(here, 'popup.html') },
  },
});

// 2. Content script (classic script, injected on demand)
await build({
  ...common,
  build: {
    outDir,
    emptyOutDir: false,
    target: 'es2022',
    lib: { entry: path.join(here, 'src', 'content.ts'), formats: ['iife'], name: 'musikContent' },
    rollupOptions: { output: { entryFileNames: 'content.js' } },
  },
});

// 3. AudioWorklet module (loaded by addModule from a web-accessible URL)
await build({
  ...common,
  build: {
    outDir,
    emptyOutDir: false,
    target: 'es2022',
    lib: {
      entry: path.join(here, 'src', 'worklet.ts'),
      formats: ['es'],
      fileName: () => 'worklet.js',
    },
  },
});

// 4. Static files
copyFileSync(
  path.join(root, 'node_modules', 'rubberband-wasm', 'dist', 'rubberband.wasm'),
  path.join(outDir, 'rubberband.wasm'),
);
copyFileSync(
  path.join(root, 'app-pwa', 'public', 'icon-128.png'),
  path.join(outDir, 'icon-128.png'),
);
const manifest = JSON.parse(readFileSync(path.join(here, 'manifest.json'), 'utf8'));
if (isTest) {
  // Test build only: allow injection on local test pages without a user gesture (activeTab).
  manifest.name += ' (test)';
  manifest.host_permissions = ['http://127.0.0.1/*', 'http://localhost/*'];
}
writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Extension built: ${outDir}`);
