/**
 * Waveform peaks. Decoding runs once when a song is added: the file is decoded at a low sample rate
 * (peaks do not need more) and reduced in a Worker. `decodeAudioData` does not exist in Workers, so
 * the decode itself happens on the main thread; the buffer is transient and not kept.
 */

/** Pure: max |sample| per bucket, normalised to 0..1. */
export function computePeaks(samples: Float32Array, buckets: number): Float32Array {
  const out = new Float32Array(buckets);
  if (samples.length === 0 || buckets <= 0) return out;
  const per = samples.length / buckets;
  let global = 0;
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * per);
    const end = Math.max(start + 1, Math.floor((b + 1) * per));
    let max = 0;
    for (let i = start; i < end && i < samples.length; i++) {
      const v = Math.abs(samples[i]!);
      if (v > max) max = v;
    }
    out[b] = max;
    if (max > global) global = max;
  }
  if (global > 0) for (let b = 0; b < buckets; b++) out[b] = out[b]! / global;
  return out;
}

export const PEAK_BUCKETS = 600;
/** Files above this size skip decoding (memory on mid-range phones); duration comes from metadata. */
export const MAX_DECODE_BYTES = 80 * 1024 * 1024;
const DECODE_RATE = 8000;

export interface DecodeResult {
  peaks: Float32Array;
  duration: number;
}

/** Duration from media metadata; 0 when it cannot be read. */
export function readDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const el = new Audio();
    const done = (d: number) => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(d) ? d : 0);
    };
    el.preload = 'metadata';
    el.onloadedmetadata = () => done(el.duration);
    el.onerror = () => done(0);
    el.src = url;
  });
}

/** Decode a file and compute peaks. Never throws: failures give empty peaks and a metadata duration. */
export async function analyzeAudio(blob: Blob, buckets = PEAK_BUCKETS): Promise<DecodeResult> {
  if (blob.size > MAX_DECODE_BYTES) {
    return { peaks: new Float32Array(0), duration: await readDuration(blob) };
  }
  try {
    const data = await blob.arrayBuffer();
    // 1 channel is enough to size the context; decodeAudioData keeps the file's channels.
    const ctx = new OfflineAudioContext(1, DECODE_RATE, DECODE_RATE);
    const buffer = await ctx.decodeAudioData(data);
    const mono = new Float32Array(buffer.length);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const ch = buffer.getChannelData(c);
      for (let i = 0; i < ch.length; i++) mono[i] = mono[i]! + ch[i]! / buffer.numberOfChannels;
    }
    const peaks = await reduceInWorker(mono, buckets);
    return { peaks, duration: buffer.duration };
  } catch {
    return { peaks: new Float32Array(0), duration: await readDuration(blob) };
  }
}

function reduceInWorker(samples: Float32Array, buckets: number): Promise<Float32Array> {
  if (typeof Worker === 'undefined') return Promise.resolve(computePeaks(samples, buckets));
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./peaks.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<Float32Array>) => {
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = () => {
      worker.terminate();
      resolve(computePeaks(samples, buckets));
    };
    worker.postMessage({ samples, buckets }, [samples.buffer]);
  });
}
