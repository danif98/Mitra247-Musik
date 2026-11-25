/**
 * Google Play edition: replaces ../personal (see app-pwa/vite.config.ts). It has the same exports
 * but does nothing, so no personal-edition code reaches the Play app. TypeScript checks the app
 * against ../personal, which these stubs must keep matching by name.
 */
export const PERSONAL = false;
export const PERSONAL_TAB = 'personal' as const;
/** A Svelte 5 component is a function: this one renders nothing. */
const Empty = (): void => {};
export const YoutubeScreen = Empty;
export const PersonalSettings = Empty;
export class YoutubeFlow {
  url = '';
}
export class ServerSettings {}
export const PERSONAL_TAB_LABEL = '';
export function bindSharedLinks(_onUrl: (url: string) => void): void {}
export function sharedUrlFromLocation(_params: URLSearchParams): string | null {
  return null;
}
export function personalSourceLabel(_source: string): string | null {
  return null;
}
