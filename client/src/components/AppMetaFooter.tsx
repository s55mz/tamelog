import { useState } from "react";

import { APP_BUILD_ID, APP_COPYRIGHT, forceRefreshApp } from "../lib/appMeta";

export function AppMetaFooter({ className = "" }: { className?: string }) {
  const [refreshing, setRefreshing] = useState(false);

  const handleForceRefresh = async () => {
    setRefreshing(true);
    try {
      await forceRefreshApp();
    } catch {
      window.location.reload();
    }
  };

  return (
    <footer className={`layout-footer ${className}`.trim()}>
      <p className="layout-footer-copy">
        {APP_COPYRIGHT} <span className="layout-footer-sep">•</span> v{APP_BUILD_ID}
      </p>
      <button className="btn btn--ghost btn--sm" disabled={refreshing} onClick={() => void handleForceRefresh()} type="button">
        <span className="material-symbols-outlined">refresh</span>
        {refreshing ? "更新中..." : "最新化"}
      </button>
    </footer>
  );
}
