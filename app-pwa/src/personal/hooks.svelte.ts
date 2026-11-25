/** Glue between the app shell and the personal edition (links shared to the app, labels). */
import { extractYoutubeUrl } from '@musik/core';
import { nativeP } from './native-personal';
import { idp } from './strings';

/** Label of the extra tab. */
export const PERSONAL_TAB_LABEL: string = idp.nav.youtube;

/** Link in the page address (Share Target / extension): ?url=...&text=...&title=... */
export function sharedUrlFromLocation(params: URLSearchParams): string | null {
  return extractYoutubeUrl(params.get('url'), params.get('text'), params.get('title'));
}

/** Library label for songs that came from the converter, or null for other sources. */
export function personalSourceLabel(source: string): string | null {
  return source === 'youtube' ? idp.library.fromYoutube : null;
}

/** Links shared to the Android app from other apps. Must be called while a component initialises. */
export function bindSharedLinks(onUrl: (url: string) => void): void {
  const plugin = nativeP;
  if (!plugin) return;
  $effect(() => {
    const handles = [
      plugin.addListener('sharedText', (e) => {
        const url = extractYoutubeUrl(e.text);
        if (url) onUrl(url);
      }),
    ];
    void plugin
      .getSharedText()
      .then((r) => {
        const url = extractYoutubeUrl(r.text);
        if (url) onUrl(url);
      })
      .catch(() => undefined);
    return () => {
      for (const h of handles) void h.then((x) => x.remove()).catch(() => undefined);
    };
  });
}
