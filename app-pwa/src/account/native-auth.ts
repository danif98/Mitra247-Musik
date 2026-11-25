/**
 * Bridge to the `MusikAuth` plugin of the Android app (sign in with Google + an access token for the
 * hidden app folder of the user's Drive). `nativeAuth` is null in a plain browser, where the
 * account section is not shown.
 */
import { registerPlugin } from '@capacitor/core';
import { native } from '../native';

export interface AuthInfo {
  email: string;
  name: string;
  photoUrl: string;
  accessToken: string;
}

export interface AuthPlugin {
  /** Account chooser and consent screen when needed. */
  signIn(opts?: { account?: string }): Promise<AuthInfo>;
  /** Fresh token without a screen; rejects with code "needs_signin" when consent is needed. */
  getAccessToken(opts?: { account?: string }): Promise<AuthInfo>;
}

export const nativeAuth: AuthPlugin | null = native
  ? registerPlugin<AuthPlugin>('MusikAuth')
  : null;
