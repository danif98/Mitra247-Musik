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
const SESSION_KEY = 'musik.session';
/** Ask the server again when the saved check is older than this (while online). */
const RECHECK_MS = 24 * 60 * 60 * 1000;

export interface AccountUser {
  email: string;
  name: string;
  photoUrl: string;
}

/** Result of the server check: valid until `exp` (ms), verified at `at` (ms). */
export interface Session {
  token: string;
  exp: number;
  at: number;
}

function readSession(): Session | null {
  try {
    const raw = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Partial<Session> | null;
    if (!raw || typeof raw.token !== 'string' || typeof raw.exp !== 'number') return null;
    return { token: raw.token, exp: raw.exp, at: typeof raw.at === 'number' ? raw.at : 0 };
  } catch {
    return null;
  }
}

/** Error of the sign-in check; `code` is one of network, blocked, rejected, auth_server. */
export class VerifyError extends Error {
  constructor(readonly code: 'network' | 'blocked' | 'rejected' | 'auth_server') {
    super(code);
    this.name = 'VerifyError';
  }
}

/** Ask the server whether this Google token may use the app (open registration, blocked list). */
async function verifyWithServer(accessToken: string): Promise<Session> {
  let res: Response;
  try {
    res = await fetch(__AUTH_URL__, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accessToken, edition: __EDITION__ }),
    });
  } catch {
    throw new VerifyError('network');
  }
  if (res.status === 403) throw new VerifyError('blocked');
  if (res.status === 401 || res.status === 400) throw new VerifyError('rejected');
  if (!res.ok) throw new VerifyError('auth_server');
  try {
    const body = (await res.json()) as { session?: unknown; exp?: unknown };
    if (typeof body.session !== 'string' || typeof body.exp !== 'number') throw new Error('shape');
    return { token: body.session, exp: body.exp * 1000, at: Date.now() };
  } catch {
    throw new VerifyError('auth_server');
  }
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
  if (err instanceof DriveError || err instanceof VerifyError) return err.code;
  return nativeErrorCode(err);
}

/** Name, email and photo of the signed-in user (scopes email and profile). Empty values on failure. */
async function fetchProfile(token: string): Promise<Partial<AccountUser>> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return {};
    const p = (await res.json()) as { email?: string; name?: string; picture?: string };
    return { email: p.email ?? '', name: p.name ?? '', photoUrl: p.picture ?? '' };
  } catch {
    return {};
  }
}

export class Account {
  /** The sign-in plugin (null in a browser). Replaceable so tests can use a fake. */
  provider = $state.raw<AuthPlugin | null>(nativeAuth);
  user = $state<AccountUser | null>(readUser());
  busy = $state(false);
  message = $state('');
  isError = $state(false);
  lastSync = $state(readNumber(LAST_KEY));
  autoSync = $state(readAuto());
  session = $state.raw<Session | null>(readSession());
  /** Re-read when the app returns to the foreground, so an expired session locks the app. */
  private clock = $state(Date.now());
  private checking = false;

  /**
   * The app may be used. Always true where there is no sign-in plugin (a browser). In the Android
   * app a valid check by the server is required; it stays valid for 30 days, also offline.
   */
  get unlocked(): boolean {
    if (!this.provider) return true;
    return this.user !== null && this.session !== null && this.session.exp > this.clock;
  }

  /** True when the app is locked because the saved check ran out (not because nobody signed in). */
  get expired(): boolean {
    return this.provider !== null && this.session !== null && this.session.exp <= this.clock;
  }

  /** Call when the app opens and returns to the foreground. */
  async guard(): Promise<void> {
    this.clock = Date.now();
    await this.refreshSession();
  }

  /**
   * Quietly ask the server again when the saved check is a day old. No internet or a server error
   * keeps the saved check; a blocked e-mail locks the app at once.
   */
  async refreshSession(): Promise<void> {
    const provider = this.provider;
    if (!provider || !this.user || this.checking) return;
    if (this.session && Date.now() - this.session.at < RECHECK_MS) return;
    // Not tied to `busy`: a Drive sync in progress must not skip the check.
    this.checking = true;
    try {
      const info = await provider.getAccessToken({ account: this.user.email });
      this.setSession(await verifyWithServer(info.accessToken));
    } catch (err) {
      if (errorCode(err) === 'blocked') {
        this.forgetLocal();
        this.say(id.account.errors.blocked, true);
      }
      /* other errors: keep the saved check until it runs out */
    } finally {
      this.checking = false;
    }
  }

  private setSession(session: Session | null): void {
    this.session = session;
    put(SESSION_KEY, session ? JSON.stringify(session) : null);
    this.clock = Date.now();
  }

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
      // The authorization API returns a token but often no profile: ask Google for it.
      if (!info.email) Object.assign(info, await fetchProfile(info.accessToken));
      if (!info.email) throw new Error('failed');
      const session = await verifyWithServer(info.accessToken);
      this.user = { email: info.email, name: info.name, photoUrl: info.photoUrl };
      put(USER_KEY, JSON.stringify(this.user));
      this.setSession(session);
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
    this.setSession(null);
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
