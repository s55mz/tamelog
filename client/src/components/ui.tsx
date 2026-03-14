import type { ReactNode } from "react";

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

/* ─── Legacy alias for StatusMessage ─────────────────────────────── */
export function StatusMessage({ kind, children }: { kind: "success" | "error"; children: ReactNode }) {
  return <Feedback kind={kind === "success" ? "ok" : "err"}>{children}</Feedback>;
}

/* ─── Empty state ─────────────────────────────────────────────────── */
export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/* ─── Auth layout ─────────────────────────────────────────────────── */
export function AuthFrame({
  title,
  children
}: {
  label?: string;
  title: string;
  description?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo__mark">
            <span className="material-symbols-outlined">savings</span>
          </div>
          <span className="auth-logo__name">貯めログ</span>
        </div>
        <div className="auth-form-card">
          <h1 className="auth-title">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}

/* ─── Legacy Panel alias (used in pages not yet migrated) ──────────── */
export function Panel({ className = "", children }: CardProps) {
  return <Card className={className}>{children}</Card>;
}

/* ─── Legacy SectionHeading alias ─────────────────────────────────── */
export function SectionHeading({
  title,
  label,
  action,
  detail
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
        {detail ? <p style={{ fontSize: "13px", color: "var(--text-2)", marginTop: "4px" }}>{detail}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

/* ─── Legacy MetricCard alias ─────────────────────────────────────── */
export function MetricCard({
  label,
  value,
  hint,
  tone = "default"
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "positive" | "negative" | "accent";
}) {
  const toneMap: Record<string, StatProps["tone"]> = {
    positive: "jade",
    negative: "coral",
    accent: "amber",
    default: "default"
  };

  return (
    <Card>
      <Stat label={label} value={value} hint={hint} tone={toneMap[tone] ?? "default"} />
    </Card>
  );
}
