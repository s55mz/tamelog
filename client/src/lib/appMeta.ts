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
  // 更新完了フラグ（sessionStorageはリロード後も残る）
  sessionStorage.setItem("_tamelog_updated", "1");

  // 1. 全キャッシュ削除
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }

  // localStorageクリア（認証トークン以外）
  for (const key of Object.keys(localStorage)) {
    if (key !== AUTH_TOKEN_KEY) localStorage.removeItem(key);
  }

  // 2. SW に SKIP_WAITING を送り新バージョンを即適用
  if ("serviceWorker" in navigator) {
    const reg = await navigator.serviceWorker.getRegistration().catch(() => undefined);
    if (reg?.waiting) {
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
      // controllerchange を待ってリロード
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true });
        // タイムアウトフォールバック
        setTimeout(resolve, 1500);
      });
    }
  }

  // 3. no-cache で強制リロード
  window.location.replace(window.location.pathname + "?_=" + Date.now());
}
