/** Vite-specific asset URLs (worklet bundle + WASM). Import only from bundled web code. */
import workletUrl from './worklet/pitch-processor.ts?worker&url';
import wasmUrl from 'rubberband-wasm/dist/rubberband.wasm?url';
import type { EngineAssets } from './engine';

export const engineAssets: EngineAssets = { workletUrl, wasmUrl };
