import { Capacitor } from '@capacitor/core';

/**
 * Register the precache service worker (production builds only). `swUrl` is relative to the page.
 *
 * Not in the Android app: its files already ship inside the APK, and a service worker would keep
 * serving the previous version for one more launch after an update. Any worker or cache left by an
 * earlier version is removed there.
 */
export function registerServiceWorker(swUrl: string, scope: string): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  if (Capacitor.isNativePlatform()) {
    void removeServiceWorkers();
    return;
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(swUrl, { scope }).catch((err: unknown) => {
      console.warn('Service worker registration failed', err);
    });
  });
}

async function removeServiceWorkers(): Promise<void> {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* nothing to clean up */
  }
}
