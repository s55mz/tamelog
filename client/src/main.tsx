import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { isBlockPageRuntime } from "./lib/blockPage";
import { APP_BUILD_ID } from "./lib/appMeta";
import { ToastProvider } from "./lib/toast";
import { BlockedPage } from "./pages/BlockedPage";
import "./styles.css";


function registerAppServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  const scriptUrl = `/sw.js?v=${encodeURIComponent(APP_BUILD_ID)}`;

  function applyWaiting(reg: ServiceWorkerRegistration) {
    if (reg.waiting) {
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
    }
  }

  // 新SWが有効になったらページリロード
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.location.reload();
  });

  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register(scriptUrl)
      .then(async (registration) => {
        await registration.update().catch(() => undefined);
        applyWaiting(registration);

        registration.addEventListener("updatefound", () => {
          const newSW = registration.installing;
          if (!newSW) return;
          newSW.addEventListener("statechange", () => {
            if (newSW.state === "installed") applyWaiting(registration);
          });
        });
      })
      .catch(console.error);
  });

  // フォアグラウンドに戻った時にSW更新チェック
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    void navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      void reg.update().catch(() => undefined).then(() => applyWaiting(reg));
    });
  });
}

async function clearBlockPageServiceWorkerState() {
  if (!("serviceWorker" in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));

  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
}

// iOS PWA: visualViewport.height は standalone で壊れる報告があるため
// innerHeight との大きい方を使い、--app-viewport-height に反映する
function syncViewportHeight() {
  const vvh = window.visualViewport?.height;
  const h = vvh && vvh > 0 ? Math.max(vvh, window.innerHeight) : window.innerHeight;
  document.documentElement.style.setProperty("--app-viewport-height", `${h}px`);
}
syncViewportHeight();
window.visualViewport?.addEventListener("resize", syncViewportHeight);
window.addEventListener("resize", syncViewportHeight);

const blockPageRuntime = isBlockPageRuntime();

if (!blockPageRuntime) {
  registerAppServiceWorker();
} else {
  void clearBlockPageServiceWorkerState();
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {blockPageRuntime ? (
      <BlockedPage />
    ) : (
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    )}
  </React.StrictMode>
);
