import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { APP_BUILD_ID } from "./lib/appMeta";
import { ToastProvider } from "./lib/toast";
import "./styles.css";

function registerAppServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  let refreshing = false;
  const scriptUrl = `/sw.js?v=${encodeURIComponent(APP_BUILD_ID)}`;

  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register(scriptUrl)
      .then(async (registration) => {
        await registration.update().catch(() => undefined);
        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }
      })
      .catch(console.error);
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

registerAppServiceWorker();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <App />
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
