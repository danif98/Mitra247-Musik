import { native, nativeErrorCode } from './native';

export type SaveResult = 'saved' | 'cancelled';

/** Raw bytes per bridge call (base64 grows them by a third). */
const CHUNK = 384 * 1024;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

interface FilePickerWindow {
  showSaveFilePicker?: (opts: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{
    createWritable: () => Promise<{
      write: (b: BlobPart) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
}

/**
 * "Save as": the Android dialog in the app, the browser's save dialog where it exists, otherwise a
 * normal download. The proposed `fileName` can be changed by the user in the dialog.
 */
export async function saveBytesAs(
  bytes: Uint8Array,
  fileName: string,
  mime = 'audio/mpeg',
): Promise<SaveResult> {
  if (native) {
    let uri: string;
    try {
      ({ uri } = await native.createDocument({ name: fileName, mime }));
    } catch (err) {
      if (nativeErrorCode(err) === 'cancelled') return 'cancelled';
      throw err;
    }
    let at = 0;
    do {
      await native.writeDocument({
        uri,
        data: toBase64(bytes.subarray(at, at + CHUNK)),
        append: at > 0,
      });
      at += CHUNK;
    } while (at < bytes.length);
    return 'saved';
  }

  const picker = (window as unknown as FilePickerWindow).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker.call(window, {
        suggestedName: fileName,
        types: [{ description: 'MP3', accept: { [mime]: ['.mp3'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(bytes as BlobPart);
      await writable.close();
      return 'saved';
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return 'cancelled';
      // No permission to open a dialog now (the render took long): fall back to a download.
    }
  }
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'saved';
}
