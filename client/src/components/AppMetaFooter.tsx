import { APP_BUILD_ID, APP_COPYRIGHT } from "../lib/appMeta";

export function AppMetaFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`layout-footer ${className}`.trim()}>
      <div className="layout-footer-left">
        <span className="layout-footer-brand">TameLog</span>
        <span className="layout-footer-sep">·</span>
        <span className="layout-footer-copy">{APP_COPYRIGHT}</span>
        <span className="layout-footer-sep">·</span>
        <span className="layout-footer-copy">v{APP_BUILD_ID}</span>
      </div>
    </footer>
  );
}
