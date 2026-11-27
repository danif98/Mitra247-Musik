import { detectKey, measureLoudnessDb, type DetectedKey } from '@musik/core';

/** Sample rate used for the analysis: low, so a long song stays small in memory. */
const ANALYSIS_RATE = 8000;

export interface SongAnalysis {
  /** Gated RMS in dBFS, or null for silence or when the file cannot be decoded. */
  loudnessDb: number | null;
  /** Estimated key, or null. */
  key: DetectedKey | null;
}

/** Decode a song once at a low sample rate and measure its loudness and its key. */
export async function analyzeSongFile(file: File): Promise<SongAnalysis> {
  try {
    const data = await file.arrayBuffer();
    const ctx = new OfflineAudioContext(1, ANALYSIS_RATE, ANALYSIS_RATE);
    const audio = await ctx.decodeAudioData(data);
    const length = audio.length;
    const mono = new Float32Array(length);
    for (let c = 0; c < audio.numberOfChannels; c++) {
      const ch = audio.getChannelData(c);
      for (let i = 0; i < length; i++) mono[i]! += ch[i]! / audio.numberOfChannels;
    }
    const loudnessDb = measureLoudnessDb(mono, audio.sampleRate);
    let key: DetectedKey | null = null;
    try {
      key = detectKey(mono, audio.sampleRate);
    } catch {
      key = null; // the key is optional; never let it break playback
    }
    return { loudnessDb, key };
  } catch {
    return { loudnessDb: null, key: null };
  }
}
