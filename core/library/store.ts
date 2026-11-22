/**
 * Local library: audio files in OPFS (Origin Private File System), metadata + peaks in IndexedDB.
 * Browser-only (not unit-tested in Node; covered by the Playwright e2e run).
 */
import { analyzeAudio } from './peaks';
import { titleFromFileName, type SongMeta } from './meta';
import { normalizePreset, type Preset } from '../practice/preset';

const DB_NAME = 'musik';
const DB_VERSION = 2;
const PRESETS = 'presets';
const STORE = 'songs';
const DIR = 'songs';

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
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
  async add(file: File, source: SongMeta['source'] = 'local'): Promise<SongMeta> {
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
      title: titleFromFileName(file.name),
      fileName: file.name,
      size: file.size,
      duration,
      addedAt: Date.now(),
      source,
      mime: file.type || 'audio/mpeg',
      peaks,
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

  /** Saved practice preset of a song, or null when none was saved. */
  async getPreset(songId: string): Promise<Preset | null> {
    const db = await this.db();
    const row = await req(db.transaction(PRESETS).objectStore(PRESETS).get(songId));
    return row ? normalizePreset(row) : null;
  }

  async setPreset(songId: string, preset: Preset): Promise<void> {
    const db = await this.db();
    await req(
      db
        .transaction(PRESETS, 'readwrite')
        .objectStore(PRESETS)
        .put({ ...preset, songId, savedAt: Date.now() }),
    );
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
