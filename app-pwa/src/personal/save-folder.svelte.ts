/**
 * Folder where converted MP3s are saved (Android app only). The folder itself and its permission
 * live in the native plugin; "also keep in the app library" is a per-device setting.
 */
import { nativeErrorCode } from '../native';
import { idp } from './strings';
import { nativeP as native } from './native-personal';

const KEEP_KEY = 'musik.keepInLibrary';

function readKeep(): boolean {
  try {
    return localStorage.getItem(KEEP_KEY) !== 'false';
  } catch {
    return true;
  }
}

export class SaveFolder {
  uri = $state('');
  label = $state('');
  writable = $state(false);
  /** Keep a copy in the app library (presets per song) besides the file in the folder. */
  keepInLibrary = $state(readKeep());
  busy = $state(false);
  message = $state('');

  get isSet(): boolean {
    return this.uri !== '';
  }

  async load(): Promise<void> {
    if (!native) return;
    try {
      this.apply(await native.getSaveFolder());
    } catch {
      /* keep the previous value */
    }
  }

  async pick(): Promise<void> {
    if (!native || this.busy) return;
    this.busy = true;
    this.message = '';
    try {
      this.apply(await native.pickSaveFolder());
      if (this.isSet && !this.writable) this.message = idp.settings.saveFolderReadOnly;
    } catch (err) {
      const code = nativeErrorCode(err);
      this.message =
        code === 'cancelled' ? idp.settings.saveFolderCancelled : idp.settings.saveFolderFailed;
    } finally {
      this.busy = false;
    }
  }

  async clear(): Promise<void> {
    if (!native || this.busy) return;
    this.busy = true;
    this.message = '';
    try {
      this.apply(await native.clearSaveFolder());
    } catch {
      /* ignore */
    } finally {
      this.busy = false;
    }
  }

  setKeepInLibrary(value: boolean): void {
    this.keepInLibrary = value;
    try {
      localStorage.setItem(KEEP_KEY, String(value));
    } catch {
      /* the setting only lasts for this session */
    }
  }

  private apply(info: { uri: string; label: string; writable: boolean }): void {
    this.uri = info.uri;
    this.label = info.label;
    this.writable = info.writable;
  }
}

/** One instance for the whole app. */
export const saveFolder = new SaveFolder();
