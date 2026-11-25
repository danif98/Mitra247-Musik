/**
 * Local library: audio files in OPFS (Origin Private File System), metadata + peaks in IndexedDB.
 * Browser-only (not unit-tested in Node; covered by the Playwright e2e run).
 */
import { analyzeAudio } from './peaks';
import { songSignature, titleFromFileName, type SongMeta } from './meta';
import { normalizePreset, type Preset } from '../practice/preset';

const DB_NAME = 'musik';
const DB_VERSION = 3;
const PRESETS = 'presets';
const STORE = 'songs';
const DIR = 'songs';

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** A preset with the signature of its song and the time it was saved (ms since epoch). */
export interface StoredPreset {
  sig: string;
  savedAt: number;
  preset: Preset;
}

export function storageSupported(): boolean {
  return typeof indexedDB !== 'undefined' && !!navigator.storage?.getDirectory;
}

export class LibraryStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private db(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains(STORE)) {
          open.result.createObjectStore(STORE, { keyPath: 'id' });
        }
        // v2: per-song practice presets
        if (!open.result.objectStoreNames.contains(PRESETS)) {
          open.result.createObjectStore(PRESETS, { keyPath: 'songId' });
        }
        // v3: presets also carry a signature (title + size) to match songs across devices
        const presets = open.transaction!.objectStore(PRESETS);
        if (!presets.indexNames.contains('sig')) presets.createIndex('sig', 'sig');
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    return this.dbPromise;
  }

  private async dir(): Promise<FileSystemDirectoryHandle> {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle(DIR, { create: true });
  }

  async list(): Promise<SongMeta[]> {
    const db = await this.db();
    const rows = await req(db.transaction(STORE).objectStore(STORE).getAll());
    return rows as SongMeta[];
  }

  /** Copy a file into OPFS, decode peaks, and store the metadata row. */
  async add(
    file: File,
    source: SongMeta['source'] = 'local',
    extra: { title?: string; credit?: SongMeta['credit'] } = {},
  ): Promise<SongMeta> {
    const id = crypto.randomUUID();
    const dir = await this.dir();
    const handle = await dir.getFileHandle(id, { create: true });
    const writable = await handle.createWritable();
    try {
      await file.stream().pipeTo(writable);
    } catch (err) {
      await dir.removeEntry(id).catch(() => undefined);
      throw err;
    }
    const { peaks, duration } = await analyzeAudio(file);
    const song: SongMeta = {
      id,
      title: extra.title?.trim() || titleFromFileName(file.name),
      fileName: file.name,
      size: file.size,
      duration,
      addedAt: Date.now(),
      source,
      mime: file.type || 'audio/mpeg',
      peaks,
      ...(extra.credit ? { credit: extra.credit } : {}),
    };
    const db = await this.db();
    const tx = db.transaction(STORE, 'readwrite');
    await req(tx.objectStore(STORE).put(song));
    return song;
  }

  async getFile(id: string): Promise<File> {
    const dir = await this.dir();
    const handle = await dir.getFileHandle(id);
    return handle.getFile();
  }

  /**
   * Saved practice preset of a song, or null when none was saved. With a signature, a preset that
   * came from another device (restored from the backup) is found too.
   */
  async getPreset(songId: string, sig?: string): Promise<Preset | null> {
    const db = await this.db();
    const store = db.transaction(PRESETS).objectStore(PRESETS);
    let row = await req(store.get(songId));
    if (!row && sig) row = await req(store.index('sig').get(sig));
    return row ? normalizePreset(row) : null;
  }

  async setPreset(songId: string, preset: Preset, sig?: string): Promise<void> {
    const db = await this.db();
    await req(
      db
        .transaction(PRESETS, 'readwrite')
        .objectStore(PRESETS)
        .put({ ...preset, songId, ...(sig ? { sig } : {}), savedAt: Date.now() }),
    );
  }

  /** Every preset with its signature, for the backup. Rows from before v3 get theirs from the song. */
  async listPresets(): Promise<StoredPreset[]> {
    const db = await this.db();
    const rows = (await req(db.transaction(PRESETS).objectStore(PRESETS).getAll())) as (Preset & {
      songId: string;
      sig?: string;
      savedAt?: number;
    })[];
    const songs = new Map((await this.list()).map((s) => [s.id, songSignature(s)]));
    const out: StoredPreset[] = [];
    for (const r of rows) {
      const sig = r.sig ?? songs.get(r.songId);
      if (sig) out.push({ sig, savedAt: r.savedAt ?? 0, preset: normalizePreset(r) });
    }
    return out;
  }

  /**
   * Store presets that came from the backup. A preset is only written when it is newer than the one
   * already on this device (matched by signature, or by library song with the same signature).
   * Returns how many were written.
   */
  async importPresets(items: StoredPreset[]): Promise<number> {
    const db = await this.db();
    const songs = await this.list();
    const bySig = new Map(songs.map((s) => [songSignature(s), s.id]));
    let written = 0;
    for (const item of items) {
      const store = () => db.transaction(PRESETS, 'readwrite').objectStore(PRESETS);
      const existing = (await req(store().index('sig').get(item.sig))) as
        { songId: string; savedAt?: number } | undefined;
      if (existing && (existing.savedAt ?? 0) >= item.savedAt) continue;
      const songId = existing?.songId ?? bySig.get(item.sig) ?? `sig:${item.sig}`;
      await req(store().put({ ...item.preset, songId, sig: item.sig, savedAt: item.savedAt }));
      written++;
    }
    return written;
  }

  async deletePreset(songId: string): Promise<void> {
    const db = await this.db();
    await req(db.transaction(PRESETS, 'readwrite').objectStore(PRESETS).delete(songId));
  }

  async rename(id: string, title: string): Promise<void> {
    const db = await this.db();
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    const row = (await req(store.get(id))) as SongMeta | undefined;
    if (!row) return;
    row.title = title.trim() || row.title;
    await req(store.put(row));
  }

  async remove(id: string): Promise<void> {
    const db = await this.db();
    await req(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id));
    await this.deletePreset(id).catch(() => undefined);
    const dir = await this.dir();
    await dir.removeEntry(id).catch(() => undefined);
  }

  /** Delete every song (metadata and files). */
  async clear(): Promise<void> {
    const db = await this.db();
    await req(db.transaction(STORE, 'readwrite').objectStore(STORE).clear());
    await req(db.transaction(PRESETS, 'readwrite').objectStore(PRESETS).clear());
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(DIR, { recursive: true }).catch(() => undefined);
  }
}
