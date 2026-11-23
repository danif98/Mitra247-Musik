/**
 * Folder tree over a flat list of songs that know their storage volume and folder (Android
 * MediaStore: volume "external_primary" = internal storage, other names = SD card / USB).
 * Pure functions, no DOM.
 */

export interface FolderSong {
  /** Storage volume id. */
  volume: string;
  /** Folder below the volume root, e.g. "Music/Pop" ("" = the root). */
  folder: string;
}

export interface FolderEntry {
  name: string;
  /** Full folder path below the volume root. */
  path: string;
  /** Songs in this folder and everything below it. */
  count: number;
}

export interface VolumeEntry {
  volume: string;
  count: number;
}

export interface FolderListing<T extends FolderSong> {
  /** Subfolders (or null when listing the volume chooser). */
  folders: FolderEntry[];
  /** Songs directly in the folder. */
  songs: T[];
  /** Only at the top level (volume === null): the storages that contain music. */
  volumes: VolumeEntry[];
}

/** "/Music//Pop/" -> "Music/Pop". */
export function normalizeFolder(path: string): string {
  return path
    .split('/')
    .filter((p) => p !== '')
    .join('/');
}

/** Parent folder path; "" for a top-level folder and for the root. */
export function parentFolder(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });

/**
 * What to show for a place in the tree. `volume === null` lists the storages; otherwise the
 * direct subfolders and songs of `path` on that volume.
 */
export function listFolder<T extends FolderSong>(
  songs: T[],
  volume: string | null,
  path: string,
): FolderListing<T> {
  if (volume === null) {
    const counts = new Map<string, number>();
    for (const s of songs) counts.set(s.volume, (counts.get(s.volume) ?? 0) + 1);
    const volumes = [...counts]
      .map(([v, count]) => ({ volume: v, count }))
      // Internal storage first, then the others by name.
      .sort((a, b) =>
        a.volume === 'external_primary'
          ? -1
          : b.volume === 'external_primary'
            ? 1
            : a.volume.localeCompare(b.volume),
      );
    return { folders: [], songs: [], volumes };
  }

  const here = normalizeFolder(path);
  const prefix = here === '' ? '' : here + '/';
  const direct: T[] = [];
  const sub = new Map<string, number>();
  for (const s of songs) {
    if (s.volume !== volume) continue;
    const f = normalizeFolder(s.folder);
    if (f === here) direct.push(s);
    else if (f.startsWith(prefix)) {
      const name = f.slice(prefix.length).split('/')[0]!;
      sub.set(name, (sub.get(name) ?? 0) + 1);
    }
  }
  const folders = [...sub]
    .map(([name, count]) => ({ name, path: prefix + name, count }))
    .sort(byName);
  return { folders, songs: direct, volumes: [] };
}
