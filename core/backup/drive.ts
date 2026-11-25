/**
 * Minimal Google Drive client for the hidden "app data" folder (scope drive.appdata). The folder
 * belongs to the user's Google account; nothing is stored on a server of ours. Works with any
 * `fetch`, so it is unit-tested against a fake Drive.
 */
import { BACKUP_FILE } from './payload';

export type DriveErrorCode = 'auth' | 'scope' | 'not_found' | 'quota' | 'server' | 'network';

export class DriveError extends Error {
  constructor(
    readonly code: DriveErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DriveError';
  }
}

export interface DriveOptions {
  /** `refresh` is true after Drive rejected the previous token. */
  getToken: (refresh: boolean) => Promise<string>;
  fetch?: typeof fetch;
}

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

export class DriveBackup {
  private readonly f: typeof fetch;

  constructor(private readonly opts: DriveOptions) {
    this.f = opts.fetch ?? ((...a) => fetch(...a));
  }

  /** One request; on 401 asks for a fresh token and tries once more. */
  private async call(url: string, init: RequestInit = {}): Promise<Response> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.opts.getToken(attempt > 0);
      let res: Response;
      try {
        res = await this.f(url, {
          ...init,
          headers: {
            ...(init.headers as Record<string, string>),
            Authorization: `Bearer ${token}`,
          },
        });
      } catch {
        throw new DriveError('network', 'network');
      }
      if (res.status === 401 && attempt === 0) continue;
      if (res.ok) return res;
      throw await toError(res);
    }
    throw new DriveError('auth', 'unauthorized');
  }

  /** Id of the backup file in the app folder, or null when there is none yet. */
  async find(): Promise<string | null> {
    const q = encodeURIComponent(`name='${BACKUP_FILE}'`);
    const res = await this.call(
      `${API}?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=10`,
    );
    const body = (await res.json()) as { files?: { id?: string }[] };
    const id = body.files?.[0]?.id;
    return typeof id === 'string' ? id : null;
  }

  /** Text of the backup file, or null when there is none. */
  async read(): Promise<{ id: string; text: string } | null> {
    const id = await this.find();
    if (!id) return null;
    try {
      const res = await this.call(`${API}/${id}?alt=media`);
      return { id, text: await res.text() };
    } catch (err) {
      if (err instanceof DriveError && err.code === 'not_found') return null;
      throw err;
    }
  }

  /** Creates the file, or replaces its content when `id` is given. Returns the file id. */
  async write(text: string, id: string | null): Promise<string> {
    if (id) {
      await this.call(`${UPLOAD}/${id}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: text,
      });
      return id;
    }
    const boundary = `musik${Math.random().toString(16).slice(2)}`;
    const meta = JSON.stringify({ name: BACKUP_FILE, parents: ['appDataFolder'] });
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--`;
    const res = await this.call(`${UPLOAD}?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    const created = (await res.json()) as { id?: string };
    if (typeof created.id !== 'string') throw new DriveError('server', 'no id');
    return created.id;
  }

  /** Deletes the backup file. Returns false when there was none. */
  async remove(): Promise<boolean> {
    const id = await this.find();
    if (!id) return false;
    try {
      await this.call(`${API}/${id}`, { method: 'DELETE' });
    } catch (err) {
      if (err instanceof DriveError && err.code === 'not_found') return false;
      throw err;
    }
    return true;
  }
}

async function toError(res: Response): Promise<DriveError> {
  if (res.status === 401) return new DriveError('auth', 'unauthorized');
  if (res.status === 404) return new DriveError('not_found', 'not found');
  if (res.status === 403) {
    const text = await res.text().catch(() => '');
    if (/insufficient|scope/i.test(text)) return new DriveError('scope', 'scope');
    if (/quota|limit/i.test(text)) return new DriveError('quota', 'quota');
    return new DriveError('scope', 'forbidden');
  }
  if (res.status === 429) return new DriveError('quota', 'rate limited');
  return new DriveError('server', `http ${res.status}`);
}
