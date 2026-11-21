import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

/** Node-only helper (tests/scripts): compile the Rubber Band WASM from node_modules. */
export async function loadRubberBandWasmNode(): Promise<WebAssembly.Module> {
  const require = createRequire(import.meta.url);
  const pkgJson = require.resolve('rubberband-wasm/package.json');
  const wasmPath = pkgJson.replace(/package\.json$/, 'dist/rubberband.wasm');
  return WebAssembly.compile(await readFile(wasmPath));
}
