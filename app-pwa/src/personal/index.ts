/**
 * Entry of the personal edition. The app imports this through the alias `@personal`; the Google
 * Play build swaps it for ../personal-stub (see app-pwa/vite.config.ts), so nothing below is part
 * of the Play app.
 */
export const PERSONAL = true;
/** Key (and element id suffix) of the extra tab. */
export const PERSONAL_TAB = 'youtube' as const;
export { default as YoutubeScreen } from './YoutubeScreen.svelte';
export { default as PersonalSettings } from './PersonalSettings.svelte';
export { YoutubeFlow } from './youtube.svelte';
export { ServerSettings } from './server.svelte';
export {
  PERSONAL_TAB_LABEL,
  bindSharedLinks,
  personalSourceLabel,
  sharedUrlFromLocation,
} from './hooks.svelte';
