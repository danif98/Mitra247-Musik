/** Download one audio file to a Blob with progress, a size limit and a content-type check. */
import { SourceError, type FetchLike } from './types';

export const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024;

const AUDIO_TYPE =
  /^(audio\/|application\/ogg|video\/ogg|application\/octet-stream|binary\/octet-stream)/i;
const GENERIC_TYPE = /^(application|binary)\/octet-stream$/i;

export interface DownloadOptions {
  fetch: FetchLike;
  signal?: AbortSignal;
  onProgress?: (received: number, total: number | null) => void;
  maxBytes?: number;
  /** Used when the server sends no usable content type. */
  fallbackMime?: string | null;
}

export async function downloadAudio(
  url: string,
  o: DownloadOptions,
): Promise<{ blob: Blob; mime: string }> {
  if (!/^https:\/\//i.test(url)) throw new SourceError('bad_url', 'only https downloads');
  const max = o.maxBytes ?? MAX_DOWNLOAD_BYTES;
  let res: Response;
  try {
    res = await o.fetch(url, { signal: o.signal });
  } catch (err) {
    if (o.signal?.aborted) throw new SourceError('aborted', 'aborted');
    throw new SourceError('network', err instanceof Error ? err.message : 'network');
  }
  if (!res.ok) throw new SourceError('http', `HTTP ${res.status}`, res.status);
  const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (type && !AUDIO_TYPE.test(type)) throw new SourceError('not_audio', `content-type ${type}`);
  const declared = Number(res.headers.get('content-length'));
  const total = Number.isFinite(declared) && declared > 0 ? declared : null;
  if (total !== null && total > max) throw new SourceError('too_large', 'file too large');

  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    if (res.body) {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > max) {
          await reader.cancel().catch(() => undefined);
          throw new SourceError('too_large', 'file too large');
        }
        chunks.push(value);
        o.onProgress?.(received, total);
      }
    } else {
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength > max) throw new SourceError('too_large', 'file too large');
      chunks.push(buf);
      received = buf.byteLength;
      o.onProgress?.(received, total);
    }
  } catch (err) {
    if (err instanceof SourceError) throw err;
    if (o.signal?.aborted) throw new SourceError('aborted', 'aborted');
    throw new SourceError('network', err instanceof Error ? err.message : 'network');
  }
  let mime: string;
  if (type && !GENERIC_TYPE.test(type)) {
    mime = /ogg/.test(type) ? 'audio/ogg' : type;
  } else {
    mime = o.fallbackMime ?? 'audio/mpeg';
  }
  return { blob: new Blob(chunks as BlobPart[], { type: mime }), mime };
}

const EXT: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
};

/** "Title" + mime -> safe file name such as "Title.mp3". */
export function fileNameFor(title: string, mime: string): string {
  const base =
    title
      // eslint-disable-next-line no-control-regex
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100) || 'lagu';
  return `${base}.${EXT[mime] ?? 'mp3'}`;
}
