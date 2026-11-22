/** Messages between the popup and the content script. */

export interface ExtStatus {
  hasMedia: boolean;
  title: string;
  /** Engine initialised (AudioContext + graph). */
  ready: boolean;
  /** Rubber Band active. False = degraded mode (tempo + minus one only). */
  pitchAvailable: boolean;
  error: string;
  tempo: number;
  semitone: number;
  minusOne: boolean;
}

export type ExtRequest =
  | { type: 'status' }
  | { type: 'set'; tempo?: number; semitone?: number; minusOne?: boolean }
  /** Test builds only: capture samples from the engine output. */
  | { type: 'test-capture'; frames?: number };

export type ExtResponse = ExtStatus | { samples: number[]; sampleRate: number };
