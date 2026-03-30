import type { ReactNode } from "react";
import { PiggyBank } from "lucide-react";

import { AppMetaFooter } from "./AppMetaFooter";

/* ─── Card ─────────────────────────────────────────────────────── */
type CardProps = { className?: string; children: ReactNode };

export function Card({ className = "", children }: CardProps) {
  return <div className={`card ${className}`.trim()}>{children}</div>;
}

/* ─── Section heading ───────────────────────────────────────────── */
type SectionHeadProps = {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
};

export function SectionHead({ title, eyebrow, action }: SectionHeadProps) {
  return (
    <div className="section-head">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2 className="section-h2">{title}</h2>
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

/* ─── Stat block ─────────────────────────────────────────────────── */
type StatProps = {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "amber" | "jade" | "coral";
  size?: "default" | "lg" | "xl";
};

export function Stat({ label, value, hint, tone = "default", size = "default" }: StatProps) {
  const toneClass = tone !== "default" ? `stat__value--${tone}` : "";
  const sizeClass = size !== "default" ? `stat__value--${size}` : "";
  return (
    <div className="stat">
      <p className="stat__label">{label}</p>
      <p className={`stat__value ${toneClass} ${sizeClass}`.trim()}>{value}</p>
      {hint ? <p className="stat__hint">{hint}</p> : null}
    </div>
  );
}

/* ─── Status messages ────────────────────────────────────────────── */
type FeedbackProps = { kind: "ok" | "err"; children: ReactNode };

export function Feedback({ kind, children }: FeedbackProps) {
  return <p className={kind === "ok" ? "ok-msg" : "err-msg"}>{children}</p>;
}

export function StatusMessage({ kind, children }: { kind: "success" | "error"; children: ReactNode }) {
  return <Feedback kind={kind === "success" ? "ok" : "err"}>{children}</Feedback>;
}

/* ─── Empty state ─────────────────────────────────────────────────── */
export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/* ─── Loading spinner ─────────────────────────────────────────────── */
export function LoadingSpinner({
  label = "読み込み中",
  subtle = false,
}: {
  label?: string;
  subtle?: boolean;
}) {
  return (
    <span className={`loading-inline ${subtle ? "loading-inline--subtle" : ""}`.trim()}>
      <span className="loading-inline__spinner" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

/* ─── Auth layout ─────────────────────────────────────────────────── */
export function AuthFrame({
  title,
  children,
}: {
  label?: string;
  title: string;
  description?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="auth-wrap">
      <div className="auth-shell">

        {/* Left hero (desktop only) */}
        <div className="auth-card--hero">
          <div className="auth-logo">
            <div className="auth-logo__mark">
              <PiggyBank size={22} strokeWidth={2} />
            </div>
            <span className="auth-logo__name">貯めログ</span>
          </div>
          <p className="auth-hero-kicker">Quiet Household Ledger</p>
          <h1 className="auth-hero-title">
            家計を落ち着いて整えるための、静かなワークスペース。
          </h1>
          <p className="auth-hero-copy">
            記録、残高、目標、ふりかえりを、装飾よりも見やすさを優先した構成でまとめています。
          </p>
          <div className="auth-hero-stack">
            <div className="auth-hero-card">
              <span className="material-symbols-outlined">dashboard</span>
              <div>
                <strong>ダーク設計で目に優しい</strong>
                <p>数字と一覧を見失わない、落ち着いたダッシュボード構成</p>
              </div>
            </div>
            <div className="auth-hero-card">
              <span className="material-symbols-outlined">edit_note</span>
              <div>
                <strong>すぐ入力して、あとで整理</strong>
                <p>スマホでもPCでも、同じ流れで記録から振り返りまで進められます</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right form */}
        <div className="auth-card--form">
          <div className="auth-form-card">
            {/* Mobile-only logo */}
            <div
              className="flex items-center gap-3 mb-8"
              style={{ display: "flex" }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 14,
                  background: "linear-gradient(135deg, var(--brand) 0%, var(--brand-strong) 100%)",
                  color: "var(--bg)",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  boxShadow: "0 3px 10px var(--brand-mid)",
                }}
              >
                <PiggyBank size={20} strokeWidth={2} />
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>
                  貯めログ
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--text-3)" }}>
                  TameLog
                </div>
              </div>
            </div>

            <p className="auth-form-kicker">Account Access</p>
            <h1 className="auth-title">{title}</h1>
            {children}
            <AppMetaFooter className="layout-footer--auth" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Legacy aliases ────────────────────────────────────────────── */
export function Panel({ className = "", children }: CardProps) {
  return <Card className={className}>{children}</Card>;
}

export function SectionHeading({
  title,
  label,
  action,
  detail,
}: {
  title: string;
  label?: string;
  action?: ReactNode;
  detail?: string;
}) {
  return (
    <div className="section-head" style={{ marginBottom: "var(--s4)" }}>
      <div>
        {label ? <p className="eyebrow">{label}</p> : null}
        <h2 className="section-h2">{title}</h2>
        {detail ? (
          <p style={{ fontSize: "13px", color: "var(--text-2)", marginTop: "4px" }}>{detail}</p>
        ) : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "positive" | "negative" | "accent";
}) {
  const toneMap: Record<string, StatProps["tone"]> = {
    positive: "jade",
    negative: "coral",
    accent:   "amber",
    default:  "default",
  };
  return (
    <Card>
      <Stat label={label} value={value} hint={hint} tone={toneMap[tone] ?? "default"} />
    </Card>
  );
}
