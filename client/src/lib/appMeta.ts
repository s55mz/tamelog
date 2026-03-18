const AUTH_TOKEN_KEY = "tamelog_token";

export const APP_VERSION = __APP_VERSION__;
export const APP_BUILD_ID = __APP_BUILD_ID__;
export const APP_COPYRIGHT = __APP_COPYRIGHT__;

export async function clearRuntimeCaches(): Promise<void> {
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }

  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  for (const key of Object.keys(localStorage)) {
    if (key !== AUTH_TOKEN_KEY) {
      localStorage.removeItem(key);
    }
  }
}

export async function forceRefreshApp(): Promise<void> {
  await clearRuntimeCaches();
  window.location.replace(`${window.location.pathname}?v=${encodeURIComponent(APP_BUILD_ID)}#refresh`);
  window.location.reload();
}
