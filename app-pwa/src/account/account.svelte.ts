/**
 * Optional Google account: shows who is signed in and keeps the practice data (presets and a few
 * settings, never the songs) in the hidden app folder of the user's own Google Drive. Nothing goes
 * to a server of ours. The app works fully without signing in.
 */
import {
  DriveBackup,
  DriveError,
  mergeBackups,
  parseBackup,
  sameBackupData,
  serializeBackup,
} from '@musik/core';
import { id } from '@musik/ui';
import type { Player } from '../player.svelte';
import { nativeErrorCode } from '../native';
import { nativeAuth, type AuthPlugin } from './native-auth';

const USER_KEY = 'musik.account';
const LAST_KEY = 'musik.sync.last';
const AUTO_KEY = 'musik.sync.auto';
const AUTO_EVERY_MS = 6 * 60 * 60 * 1000;

export interface AccountUser {
  email: string;
  name: string;
  photoUrl: string;
}

function readUser(): AccountUser | null {
  try {
    const raw = JSON.parse(localStorage.getItem(USER_KEY) ?? 'null') as Partial<AccountUser> | null;
    if (!raw || typeof raw.email !== 'string' || raw.email === '') return null;
    return {
      email: raw.email,
      name: typeof raw.name === 'string' ? raw.name : '',
      photoUrl: typeof raw.photoUrl === 'string' ? raw.photoUrl : '',
    };
  } catch {
    return null;
  }
}

function readNumber(key: string): number {
  try {
    const n = Number(localStorage.getItem(key));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function readAuto(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) !== 'false';
  } catch {
    return true;
  }
}

function put(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the setting just is not remembered */
  }
}

/** Short error code from the plugin or from Drive. */
function errorCode(err: unknown): string {
  if (err instanceof DriveError) return err.code;
  return nativeErrorCode(err);
}

export class Account {
  /** The sign-in plugin (null in a browser). Replaceable so tests can use a fake. */
  provider = $state<AuthPlugin | null>(nativeAuth);
  user = $state<AccountUser | null>(readUser());
  busy = $state(false);
  message = $state('');
  isError = $state(false);
  lastSync = $state(readNumber(LAST_KEY));
  autoSync = $state(readAuto());

  get available(): boolean {
    return this.provider !== null;
  }

  setProvider(provider: AuthPlugin | null): void {
    this.provider = provider;
  }

  private say(text: string, error = false): void {
    this.message = text;
    this.isError = error;
  }

  private fail(err: unknown): void {
    const code = errorCode(err);
    const known = id.account.errors as Record<string, string>;
    this.say(known[code] ?? id.account.errors.failed, true);
  }

  async signIn(player: Player): Promise<void> {
    const provider = this.provider;
    if (!provider || this.busy) return;
    this.busy = true;
    this.say('');
    try {
      const info = await provider.signIn(this.user ? { account: this.user.email } : {});
      this.user = { email: info.email, name: info.name, photoUrl: info.photoUrl };
      put(USER_KEY, JSON.stringify(this.user));
    } catch (err) {
      this.fail(err);
      this.busy = false;
      return;
    }
    this.busy = false;
    await this.sync(player);
  }

  /** Forget the account on this phone. The backup in Drive stays (see `deleteBackup`). */
  signOut(): void {
    this.forgetLocal();
    this.say(id.account.signedOut);
  }

  /** Remove everything this phone remembers about the account (also used by "delete all data"). */
  forgetLocal(): void {
    this.user = null;
    this.lastSync = 0;
    put(USER_KEY, null);
    put(LAST_KEY, null);
  }

  setAuto(enabled: boolean): void {
    this.autoSync = enabled;
    put(AUTO_KEY, String(enabled));
  }

  private drive(): DriveBackup {
    const provider = this.provider!;
    const email = this.user?.email ?? '';
    return new DriveBackup({
      getToken: async () =>
        (await provider.getAccessToken(email ? { account: email } : {})).accessToken,
    });
  }

  /**
   * Two-way merge with the backup in Drive: the preset saved last wins for each song; the result is
   * written back and taken over on this phone.
   */
  async sync(player: Player, silent = false): Promise<void> {
    if (!this.provider || !this.user || this.busy) return;
    this.busy = true;
    if (!silent) this.say(id.account.syncing);
    try {
      const drive = this.drive();
      const found = await drive.read();
      const remote = parseBackup(found?.text);
      const local = await player.exportBackup();
      const merged = mergeBackups(local, remote);
      if (!remote || !sameBackupData(merged, remote)) {
        await drive.write(serializeBackup(merged), found?.id ?? null);
      }
      const applied = await player.importBackup(merged);
      this.lastSync = Date.now();
      put(LAST_KEY, String(this.lastSync));
      this.say(
        applied.settings > 0 ? `${id.account.synced} ${id.account.restartNote}` : id.account.synced,
      );
    } catch (err) {
      if (!silent || errorCode(err) !== 'network') this.fail(err);
    } finally {
      this.busy = false;
    }
  }

  /** When the app opens: sync quietly if signed in, enabled, and the last sync is old enough. */
  async syncOnStart(player: Player): Promise<void> {
    if (!this.provider || !this.user || !this.autoSync) return;
    if (Date.now() - this.lastSync < AUTO_EVERY_MS) return;
    await this.sync(player, true);
  }

  /** Delete the backup file in the user's Drive. This phone keeps its own data. */
  async deleteBackup(): Promise<void> {
    if (!this.provider || !this.user || this.busy) return;
    this.busy = true;
    this.say('');
    try {
      const removed = await this.drive().remove();
      this.say(removed ? id.account.deleted : id.account.noBackup);
    } catch (err) {
      this.fail(err);
    } finally {
      this.busy = false;
    }
  }
}

export const account = new Account();
