/** Register the precache service worker (production builds only). `swUrl` is relative to the page. */
export function registerServiceWorker(swUrl: string, scope: string): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(swUrl, { scope }).catch((err: unknown) => {
      console.warn('Service worker registration failed', err);
    });
  });
}
