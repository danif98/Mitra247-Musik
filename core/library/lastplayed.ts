/**
 * "Last played": the queue and the song that was playing, kept on the device so the Play screen can
 * show them again after the app is reopened. Pure functions (unit-tested); the player does the
 * storage.
 *
 * A queue comes from the app library (only the song ids are kept, the songs live in IndexedDB) or
 * from music on the phone (the MediaStore entries are kept, the files live outside the app).
 */

export interface LastTrack {
  /** content:// URI (Android MediaStore or a chosen folder). */
  uri: string;
  title: string;
  artist: string;
  fileName: string;
  size: number;
  /** Seconds. */
  duration: number;
  mime: string;
}

export interface LastQueue {
  v: 1;
  /** Where the list came from. */
  source: 'library' | 'device';
  /** Readable origin shown above the list, e.g. "Library" or "Musik di HP · Music/Pop". */
  label: string;
  /** Position of the playing track in the list. */
  index: number;
  /** Library: song ids in queue order. */
  ids?: string[];
  /** Device: the tracks in queue order. */
  tracks?: LastTrack[];
}

export interface LastPosition {
  /** Id of the song the position belongs to (library id, or "uri" of a device track). */
  key: string;
  /** Seconds. */
  position: number;
}

/** Most tracks kept for a device list (the rest of a very long list is dropped around the playing track). */
export const MAX_LAST_TRACKS = 1000;

const str = (v: unknown, max = 300): string => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

function parseTrack(raw: unknown): LastTrack | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const uri = str(o['uri'], 2000);
  if (!uri.startsWith('content://')) return null;
  return {
    uri,
    title: str(o['title']) || 'Tanpa judul',
    artist: str(o['artist'], 120),
    fileName: str(o['fileName']),
    size: num(o['size']),
    duration: num(o['duration']),
    mime: str(o['mime'], 60) || 'audio/mpeg',
  };
}

/** Stored JSON -> a valid LastQueue, or null when it is missing or unusable. */
export function parseLastQueue(json: string | null): LastQueue | null {
  if (!json) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o['v'] !== 1) return null;
  const label = str(o['label'], 200);
  const index = Math.max(0, Math.floor(num(o['index'])));
  if (o['source'] === 'library' && Array.isArray(o['ids'])) {
    const ids = o['ids'].filter((x): x is string => typeof x === 'string' && x !== '');
    if (ids.length === 0) return null;
    return { v: 1, source: 'library', label, index: Math.min(index, ids.length - 1), ids };
  }
  if (o['source'] === 'device' && Array.isArray(o['tracks'])) {
    const tracks = o['tracks'].map(parseTrack).filter((t): t is LastTrack => t !== null);
    if (tracks.length === 0) return null;
    return { v: 1, source: 'device', label, index: Math.min(index, tracks.length - 1), tracks };
  }
  return null;
}

/** Keeps at most MAX_LAST_TRACKS tracks, a window around the playing one; returns the new index. */
export function limitTracks(
  tracks: LastTrack[],
  index: number,
  max = MAX_LAST_TRACKS,
): { tracks: LastTrack[]; index: number } {
  if (tracks.length <= max) return { tracks, index };
  const start = Math.min(Math.max(0, index - Math.floor(max / 2)), tracks.length - max);
  return { tracks: tracks.slice(start, start + max), index: index - start };
}

export function serializeLastQueue(q: LastQueue): string {
  return JSON.stringify(q);
}

export function parseLastPosition(json: string | null): LastPosition | null {
  if (!json) return null;
  try {
    const o = JSON.parse(json) as Record<string, unknown>;
    const key = str(o['key'], 2000);
    return key ? { key, position: num(o['position']) } : null;
  } catch {
    return null;
  }
}
