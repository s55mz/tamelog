import { APP_BUILD_ID, APP_COPYRIGHT } from "../lib/appMeta";
import { useApiStatus } from "../lib/useApiStatus";

const STATUS_CONFIG = {
  ok:          { color: "#059669", bg: "#ECFDF5", label: "正常" },
  degraded:    { color: "#D97706", bg: "#FFFBEB", label: "一部障害" },
  unreachable: { color: "#DC2626", bg: "#FEF2F2", label: "接続不可" },
  loading:     { color: "#94A3B8", bg: "#F1F5F9", label: "確認中" },
} as const;

export function AppMetaFooter({ className = "" }: { className?: string }) {
  const status = useApiStatus();
  const cfg = STATUS_CONFIG[status];

  return (
    <footer className={`layout-footer ${className}`.trim()}>
      <div className="layout-footer-left">
        <span className="layout-footer-brand">
          <span className="material-symbols-outlined" style={{ fontSize: "14px", verticalAlign: "middle" }}>savings</span>
          {" "}TameLog
        </span>
        <span className="layout-footer-sep">|</span>
        <span className="layout-footer-copy">{APP_COPYRIGHT}</span>
        <span className="layout-footer-sep">|</span>
        <span className="layout-footer-copy">v{APP_BUILD_ID}</span>
      </div>

      <span style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        background: cfg.bg, border: `1px solid ${cfg.color}22`,
        borderRadius: 20, padding: "3px 10px 3px 7px",
        fontSize: 11, fontWeight: 600, color: cfg.color,
        letterSpacing: "0.02em", lineHeight: 1,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%", background: cfg.color, flexShrink: 0,
          ...(status === "ok" ? { animation: "statusPulse 2.5s ease-in-out infinite" } : {})
        }} />
        システム {cfg.label}
      </span>
    </footer>
  );
}
