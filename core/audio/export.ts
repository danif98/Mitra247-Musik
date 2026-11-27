/**
 * "Save as MP3": render the current song with the tempo, key, Minus One, equalizer and volume that
 * are set while practising, and encode it as MP3.
 *
 * Steps: decode (44.1 kHz) -> Rubber Band offline (tempo and key together, highest quality) ->
 * Web Audio offline graph (the same Minus One and Equalizer classes as live playback, then
 * loudness gain, volume and limiter) -> lamejs. Needs a browser (OfflineAudioContext).
 */
import { RubberBandInterface, RubberBandOption } from 'rubberband-wasm';
import type { RubberBandEngine } from './pitch-math';
import { clampSemitone, clampTempo, semitonesToRatio } from './pitch-math';
import { MinusOne, type MinusOneParams } from './minus-one';
import { Equalizer } from './eq';
import { createLimiter } from './limiter';

export const EXPORT_SAMPLE_RATE = 44100;
export const EXPORT_KBPS = 192;
/** Longest song that can be exported (a phone must hold several copies of it in memory). */
export const EXPORT_MAX_SECONDS = 12 * 60;

export type ExportStage = 'decode' | 'stretch' | 'effects' | 'encode';

export interface EffectSettings {
  minusOne: boolean;
  moParams: MinusOneParams;
  eq: readonly number[];
  /** Linear volume (1 = 100%, up to 2). */
  volume: number;
  /** Linear loudness gain from "samakan volume" (1 = none). */
  normGain: number;
}

export interface ExportProgress {
  stage: ExportStage;
  /** 0..1 over the whole export. */
  fraction: number;
}

export interface ExportRequest {
  file: Blob;
  wasm: WebAssembly.Module;
  tempo: number;
  semitone: number;
  engine: RubberBandEngine;
  effects: EffectSettings;
  kbps?: number;
  onProgress?: (p: ExportProgress) => void;
  signal?: AbortSignal;
}

export class ExportError extends Error {
  readonly code: 'cancelled' | 'too_long' | 'decode' | 'failed';
  constructor(code: 'cancelled' | 'too_long' | 'decode' | 'failed', message: string) {
    super(message);
    this.code = code;
  }
}

// --- file name ---------------------------------------------------------------------------------

/** Remove characters a file name cannot hold on Android, Windows and web downloads. */
export function sanitizeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ');
  return cleaned.trim().replace(/^\.+/, '').slice(0, 150).trim();
}

/** "+2", "-3" or "0". */
export function formatKey(semitone: number): string {
  const n = Math.round(semitone);
  return n > 0 ? `+${n}` : String(n);
}

/** Tempo as a percentage: 1 -> "100", 0.75 -> "75". */
export function formatTempoPercent(tempo: number): string {
  return String(Math.round(tempo * 100));
}

/** Default file name (no extension): "Idol - Yoasobi [Tempo 100 - Key +2]". */
export function practiceFileName(
  title: string,
  artist: string | undefined,
  tempo: number,
  semitone: number,
): string {
  const who = artist?.trim();
  const base = who ? `${title.trim()} - ${who}` : title.trim();
  const tag = `[Tempo ${formatTempoPercent(tempo)} - Key ${formatKey(semitone)}]`;
  return sanitizeFileName(`${base || 'Lagu'} ${tag}`);
}

// --- steps -------------------------------------------------------------------------------------

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ExportError('cancelled', 'cancelled');
}

/** Let the page paint and handle taps between two chunks of heavy work. */
function breathe(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Decode any supported file to 2 channels at 44.1 kHz. */
export async function decodeForExport(file: Blob, signal?: AbortSignal): Promise<Float32Array[]> {
  const data = await file.arrayBuffer();
  checkAbort(signal);
  let audio: AudioBuffer;
  try {
    audio = await new OfflineAudioContext(2, 1, EXPORT_SAMPLE_RATE).decodeAudioData(data);
  } catch {
    throw new ExportError('decode', 'decode');
  }
  if (audio.duration > EXPORT_MAX_SECONDS) throw new ExportError('too_long', 'too_long');
  const left = audio.getChannelData(0);
  const right = audio.numberOfChannels > 1 ? audio.getChannelData(1) : left;
  return [left, right];
}

/**
 * Change tempo and key with Rubber Band in offline mode (study pass, then process pass).
 * Returns the input itself when both are unchanged.
 */
export async function stretchOffline(
  wasm: WebAssembly.Module,
  input: Float32Array[],
  sampleRate: number,
  tempo: number,
  semitone: number,
  engine: RubberBandEngine,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<Float32Array[]> {
  const t = clampTempo(tempo);
  const st = clampSemitone(semitone);
  if (t === 1 && st === 0) return input;
  const channels = input.length;
  const total = input[0]?.length ?? 0;
  const O = RubberBandOption;
  const options =
    O.RubberBandOptionProcessOffline |
    O.RubberBandOptionThreadingNever |
    O.RubberBandOptionChannelsTogether |
    O.RubberBandOptionWindowStandard |
    (engine === 'R3' ? O.RubberBandOptionEngineFiner : O.RubberBandOptionEngineFaster);

  const rb = await RubberBandInterface.initialize(wasm);
  const state = rb.rubberband_new(sampleRate, channels, options, 1 / t, semitonesToRatio(st));
  const BLOCK = 1024;
  const inPtrs: number[] = [];
  const outPtrs: number[] = [];
  const inArray = rb.malloc(channels * 4);
  const outArray = rb.malloc(channels * 4);
  for (let c = 0; c < channels; c++) {
    const ip = rb.malloc(BLOCK * 4);
    const op = rb.malloc(BLOCK * 4);
    inPtrs.push(ip);
    outPtrs.push(op);
    rb.memWritePtr(inArray + c * 4, ip);
    rb.memWritePtr(outArray + c * 4, op);
  }
  const chunks: Float32Array[][] = Array.from({ length: channels }, () => []);
  let produced = 0;
  const feed = (pos: number, size: number): void => {
    for (let c = 0; c < channels; c++) {
      rb.memWrite(inPtrs[c]!, input[c]!.subarray(pos, pos + size));
    }
  };
  const drain = (): void => {
    for (;;) {
      const available = rb.rubberband_available(state);
      if (available < 1) return;
      const got = rb.rubberband_retrieve(state, outArray, Math.min(available, BLOCK));
      if (got < 1) return;
      for (let c = 0; c < channels; c++) chunks[c]!.push(rb.memReadF32(outPtrs[c]!, got).slice());
      produced += got;
    }
  };
  try {
    rb.rubberband_set_expected_input_duration(state, total);
    let n = 0;
    for (let pos = 0; pos < total; pos += BLOCK) {
      const size = Math.min(BLOCK, total - pos);
      feed(pos, size);
      rb.rubberband_study(state, inArray, size, pos + size >= total ? 1 : 0);
      if (++n % 256 === 0) {
        onProgress?.((pos / total) * 0.4);
        await breathe();
        checkAbort(signal);
      }
    }
    n = 0;
    for (let pos = 0; pos < total; pos += BLOCK) {
      const size = Math.min(BLOCK, total - pos);
      feed(pos, size);
      rb.rubberband_process(state, inArray, size, pos + size >= total ? 1 : 0);
      drain();
      if (++n % 128 === 0) {
        onProgress?.(0.4 + (pos / total) * 0.6);
        await breathe();
        checkAbort(signal);
      }
    }
    drain();
  } finally {
    for (const p of [...inPtrs, ...outPtrs, inArray, outArray]) rb.free(p);
    rb.rubberband_delete(state);
  }
  return chunks.map((list) => {
    const out = new Float32Array(produced);
    let at = 0;
    for (const part of list) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  });
}

/** Minus One, equalizer, loudness gain, volume and limiter: the same chain as live playback. */
export async function renderEffects(
  input: Float32Array[],
  sampleRate: number,
  fx: EffectSettings,
): Promise<Float32Array[]> {
  const frames = Math.max(1, input[0]?.length ?? 0);
  const ctx = new OfflineAudioContext(2, frames, sampleRate);
  const buffer = ctx.createBuffer(2, frames, sampleRate);
  buffer.copyToChannel(input[0] as Float32Array<ArrayBuffer>, 0);
  buffer.copyToChannel((input[1] ?? input[0]) as Float32Array<ArrayBuffer>, 1);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const minusOne = new MinusOne(ctx);
  minusOne.apply(fx.moParams);
  minusOne.setEnabled(fx.minusOne);
  const eq = new Equalizer(ctx);
  eq.setAll(fx.eq);
  const norm = ctx.createGain();
  norm.gain.value = fx.normGain;
  const volume = ctx.createGain();
  volume.gain.value = fx.volume;
  source.connect(minusOne.input);
  minusOne.output.connect(eq.input);
  eq.output.connect(norm);
  norm.connect(volume);
  volume.connect(createLimiter(ctx)).connect(ctx.destination);
  source.start();
  const rendered = await ctx.startRendering();
  return [rendered.getChannelData(0).slice(), rendered.getChannelData(1).slice()];
}

/** Encode 2 channels as MP3 (CBR). lamejs is loaded only when needed. */
export async function encodeMp3(
  channels: Float32Array[],
  sampleRate: number,
  kbps: number = EXPORT_KBPS,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const encoder = new Mp3Encoder(2, sampleRate, kbps);
  const left = channels[0]!;
  const right = channels[1] ?? left;
  const total = left.length;
  const STEP = 1152 * 16;
  const parts: Uint8Array[] = [];
  const toInt16 = (src: Float32Array, from: number, to: number): Int16Array => {
    const out = new Int16Array(to - from);
    for (let i = from; i < to; i++) {
      const v = Math.max(-1, Math.min(1, src[i]!));
      out[i - from] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    return out;
  };
  let n = 0;
  for (let pos = 0; pos < total; pos += STEP) {
    const end = Math.min(total, pos + STEP);
    const chunk = encoder.encodeBuffer(toInt16(left, pos, end), toInt16(right, pos, end));
    if (chunk.length > 0) parts.push(chunk.slice());
    if (++n % 8 === 0) {
      onProgress?.(pos / total);
      await breathe();
      checkAbort(signal);
    }
  }
  const tail = encoder.flush();
  if (tail.length > 0) parts.push(tail.slice());
  let size = 0;
  for (const p of parts) size += p.length;
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** The whole export: decode, tempo and key, effects, MP3. */
export async function exportPracticeMp3(req: ExportRequest): Promise<Uint8Array> {
  const report = (stage: ExportStage, local: number, from: number, to: number) =>
    req.onProgress?.({ stage, fraction: from + (to - from) * Math.min(1, Math.max(0, local)) });
  try {
    report('decode', 0, 0, 0.1);
    let audio: Float32Array[] | null = await decodeForExport(req.file, req.signal);
    report('stretch', 0, 0.1, 0.6);
    let stretched: Float32Array[] | null = await stretchOffline(
      req.wasm,
      audio,
      EXPORT_SAMPLE_RATE,
      req.tempo,
      req.semitone,
      req.engine,
      (f) => report('stretch', f, 0.1, 0.6),
      req.signal,
    );
    audio = null;
    checkAbort(req.signal);
    report('effects', 0, 0.6, 0.7);
    let finished: Float32Array[] | null = await renderEffects(
      stretched,
      EXPORT_SAMPLE_RATE,
      req.effects,
    );
    stretched = null;
    checkAbort(req.signal);
    report('encode', 0, 0.7, 1);
    const mp3 = await encodeMp3(
      finished,
      EXPORT_SAMPLE_RATE,
      req.kbps ?? EXPORT_KBPS,
      (f) => report('encode', f, 0.7, 1),
      req.signal,
    );
    finished = null;
    report('encode', 1, 0.7, 1);
    return mp3;
  } catch (err) {
    if (err instanceof ExportError) throw err;
    throw new ExportError('failed', err instanceof Error ? err.message : String(err));
  }
}
