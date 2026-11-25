import { describe, expect, it } from 'vitest';
import { defaultPreset } from '../practice/preset';
import { songSignature } from '../library/meta';
import { DriveBackup, DriveError } from './drive';
import {
  BACKUP_FILE,
  emptyBackup,
  mergeBackups,
  parseBackup,
  sameBackupData,
  serializeBackup,
  type BackupData,
} from './payload';

const preset = (tempo: number) => ({ ...defaultPreset(), tempo });
const backup = (
  presets: [string, number, number][],
  settings: Record<string, string> = {},
  updatedAt = 1,
): BackupData => ({
  v: 1,
  updatedAt,
  settings,
  presets: presets.map(([sig, savedAt, tempo]) => ({ sig, savedAt, preset: preset(tempo) })),
});

describe('songSignature', () => {
  it('ignores case, spaces and accents form, and keeps the size', () => {
    expect(songSignature({ title: '  Balada   SENJA ', size: 1000.4 })).toBe('balada senja|1000');
    expect(songSignature({ title: 'Balada Senja', size: 1000 })).toBe('balada senja|1000');
    expect(songSignature({ title: 'Balada Senja', size: 999 })).not.toBe('balada senja|1000');
  });
});

describe('parseBackup', () => {
  it('round trips', () => {
    const b = backup([['a|1', 5, 0.8]], { 'musik.engine': 'R3' });
    expect(parseBackup(serializeBackup(b))).toEqual(b);
  });
  it('rejects broken or too new data', () => {
    expect(parseBackup(null)).toBeNull();
    expect(parseBackup('not json')).toBeNull();
    expect(parseBackup('[]')).toBeNull();
    expect(parseBackup('{"v":99}')).toBeNull();
    expect(parseBackup('{"presets":[]}')).toBeNull();
  });
  it('drops bad entries and unknown settings, and fixes preset values', () => {
    const text = JSON.stringify({
      v: 1,
      updatedAt: 3,
      settings: { 'musik.engine': 'R3', 'musik.server.token': 'secret', 'musik.last': 'x' },
      presets: [
        { sig: '', savedAt: 1, preset: {} },
        { sig: 'x'.repeat(400), savedAt: 1, preset: {} },
        'junk',
        { sig: 'ok|1', savedAt: 9, preset: { tempo: 50, semitone: 99 } },
      ],
    });
    const b = parseBackup(text)!;
    expect(b.settings).toEqual({ 'musik.engine': 'R3' });
    expect(b.presets).toHaveLength(1);
    expect(b.presets[0]!.preset.tempo).toBeLessThanOrEqual(2);
    expect(b.presets[0]!.preset.semitone).toBeLessThanOrEqual(12);
  });
});

describe('mergeBackups', () => {
  it('uses the local data when there is no backup yet', () => {
    const local = backup([['a|1', 5, 0.8]]);
    expect(mergeBackups(local, null, 99).presets).toEqual(local.presets);
  });
  it('keeps the preset saved last for each song', () => {
    const local = backup([
      ['a|1', 10, 0.8],
      ['b|2', 1, 1.2],
    ]);
    const remote = backup([
      ['a|1', 5, 0.5],
      ['b|2', 7, 1.5],
      ['c|3', 2, 0.9],
    ]);
    const m = mergeBackups(local, remote, 99);
    const t = Object.fromEntries(m.presets.map((p) => [p.sig, p.preset.tempo]));
    expect(t).toEqual({ 'a|1': 0.8, 'b|2': 1.5, 'c|3': 0.9 });
    expect(m.updatedAt).toBe(99);
  });
  it('keeps local settings and fills missing ones from the backup', () => {
    const local = backup([], { 'musik.engine': 'R2' });
    const remote = backup([], { 'musik.engine': 'R3', 'musik.metronome': '{"bpm":90}' });
    expect(mergeBackups(local, remote).settings).toEqual({
      'musik.engine': 'R2',
      'musik.metronome': '{"bpm":90}',
    });
  });
  it('sameBackupData ignores the write time and the order', () => {
    const a = backup(
      [
        ['a|1', 1, 1],
        ['b|2', 2, 1],
      ],
      {},
      1,
    );
    const b = backup(
      [
        ['b|2', 2, 1],
        ['a|1', 1, 1],
      ],
      {},
      50,
    );
    expect(sameBackupData(a, b)).toBe(true);
    expect(sameBackupData(a, backup([['a|1', 1, 1]]))).toBe(false);
    expect(sameBackupData(null, null)).toBe(true);
    expect(sameBackupData(a, null)).toBe(false);
  });
  it('emptyBackup is valid', () => {
    expect(parseBackup(serializeBackup(emptyBackup(5)))).toEqual(emptyBackup(5));
  });
});

/** A fake Drive app folder behind `fetch`. */
function fakeDrive(opts: { failFirstWith401?: boolean; status?: number } = {}) {
  const files = new Map<string, string>();
  const seen: { method: string; url: string; auth: string | null }[] = [];
  let first = true;
  let next = 1;
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const auth = new Headers(init?.headers).get('Authorization');
    seen.push({ method, url, auth });
    if (opts.status) return new Response('x', { status: opts.status });
    if (opts.failFirstWith401 && first) {
      first = false;
      return new Response('', { status: 401 });
    }
    const u = new URL(url);
    if (u.pathname === '/drive/v3/files' && method === 'GET') {
      const q = u.searchParams.get('q') ?? '';
      expect(u.searchParams.get('spaces')).toBe('appDataFolder');
      const id = [...files.keys()][0];
      return Response.json({ files: q.includes(BACKUP_FILE) && id ? [{ id }] : [] });
    }
    if (u.pathname.startsWith('/drive/v3/files/') && method === 'GET') {
      const body = files.get(u.pathname.split('/').pop()!);
      return body === undefined ? new Response('', { status: 404 }) : new Response(body);
    }
    if (u.pathname.startsWith('/drive/v3/files/') && method === 'DELETE') {
      files.delete(u.pathname.split('/').pop()!);
      return new Response(null, { status: 204 });
    }
    if (u.pathname === '/upload/drive/v3/files' && method === 'POST') {
      const text = String(init?.body);
      expect(text).toContain('"parents":["appDataFolder"]');
      const content = text.split('Content-Type: application/json\r\n\r\n')[1]!.split('\r\n--')[0]!;
      const id = `f${next++}`;
      files.set(id, content);
      return Response.json({ id });
    }
    if (u.pathname.startsWith('/upload/drive/v3/files/') && method === 'PATCH') {
      files.set(u.pathname.split('/').pop()!, String(init?.body));
      return Response.json({ id: u.pathname.split('/').pop() });
    }
    return new Response('?', { status: 500 });
  };
  return { fetch, files, seen };
}

describe('DriveBackup', () => {
  const token = async (refresh: boolean) => (refresh ? 'new-token' : 'token');

  it('creates, reads, updates and deletes the backup in the app folder', async () => {
    const d = fakeDrive();
    const drive = new DriveBackup({ getToken: token, fetch: d.fetch });
    expect(await drive.read()).toBeNull();
    const id = await drive.write('{"v":1}', null);
    expect(await drive.read()).toEqual({ id, text: '{"v":1}' });
    await drive.write('{"v":1,"x":2}', id);
    expect((await drive.read())!.text).toBe('{"v":1,"x":2}');
    expect(d.files.size).toBe(1);
    expect(await drive.remove()).toBe(true);
    expect(await drive.remove()).toBe(false);
    expect(d.files.size).toBe(0);
    expect(d.seen.every((s) => s.auth === 'Bearer token')).toBe(true);
  });

  it('asks for a fresh token once when Drive answers 401', async () => {
    const d = fakeDrive({ failFirstWith401: true });
    const drive = new DriveBackup({ getToken: token, fetch: d.fetch });
    expect(await drive.read()).toBeNull();
    expect(d.seen[0]!.auth).toBe('Bearer token');
    expect(d.seen[1]!.auth).toBe('Bearer new-token');
  });

  it('maps failures to error codes', async () => {
    for (const [status, code] of [
      [401, 'auth'],
      [403, 'scope'],
      [404, 'not_found'],
      [429, 'quota'],
      [503, 'server'],
    ] as const) {
      const drive = new DriveBackup({ getToken: token, fetch: fakeDrive({ status }).fetch });
      await expect(drive.find()).rejects.toMatchObject({ code });
    }
    const offline = new DriveBackup({
      getToken: token,
      fetch: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    await expect(offline.find()).rejects.toBeInstanceOf(DriveError);
    await expect(offline.find()).rejects.toMatchObject({ code: 'network' });
  });
});
