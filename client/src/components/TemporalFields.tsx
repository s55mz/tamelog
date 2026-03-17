import { useState, type ReactNode } from "react";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function nowStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function todayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function yesterdayDateStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatDisplay(value: string): string {
  if (!value) return "—";
  try {
    const [datePart, timePart] = value.split("T");
    if (!datePart) return "—";
    const [, month, day] = datePart.split("-");
    if (!timePart) return `${month}/${day}`;
    const [hour, minute] = timePart.split(":");
    return `${month}/${day} ${hour}:${minute}`;
  } catch {
    return value;
  }
}

type DateTimeFieldProps = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
};

export function DateTimeField({ label, value, onChange, required }: DateTimeFieldProps) {
  const [expanded, setExpanded] = useState(false);

  const currentDate = value.split("T")[0] ?? "";
  const currentTime = value.split("T")[1] ?? `${pad2(new Date().getHours())}:${pad2(new Date().getMinutes())}`;
  const today = todayDateStr();
  const yesterday = yesterdayDateStr();
  const isToday = currentDate === today;
  const isYesterday = currentDate === yesterday;

  const setNow = () => {
    onChange(nowStr());
    setExpanded(false);
  };

  const setYesterdayFn = () => {
    onChange(`${yesterday}T${currentTime}`);
    setExpanded(false);
  };

  return (
    <div className="field">
      {label ? (
        <span className="field__label">
          {label}
          {required ? <span className="field__required">必須</span> : null}
        </span>
      ) : null}
      <div className="quick-dt">
        <button
          className={`quick-dt__chip${isToday ? " on" : ""}`}
          onClick={setNow}
          type="button"
        >
          今
        </button>
        <button
          className={`quick-dt__chip${isYesterday ? " on" : ""}`}
          onClick={setYesterdayFn}
          type="button"
        >
          昨日
        </button>
        <button
          className={`quick-dt__custom${expanded ? " on" : ""}`}
          onClick={() => setExpanded((v) => !v)}
          type="button"
        >
          <span className="material-symbols-outlined">calendar_today</span>
          <span>{formatDisplay(value)}</span>
        </button>
      </div>
      {expanded ? (
        <input
          className="quick-dt__native"
          onChange={(e) => onChange(e.target.value)}
          type="datetime-local"
          value={value}
        />
      ) : null}
    </div>
  );
}

/* ── TimeField (used in SettingsPage for block schedules) ── */
type TimeFieldProps = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
};

type DateFieldProps = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
};

function FieldShell({ label, required, children }: { label?: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="field">
      {label ? (
        <span className="field__label">
          {label}
          {required ? <span className="field__required">必須</span> : null}
        </span>
      ) : null}
      {children}
    </label>
  );
}

export function TimeField({ label, value, onChange, required }: TimeFieldProps) {
  return (
    <FieldShell label={label} required={required}>
      <input
        className="quick-dt__native"
        onChange={(e) => onChange(e.target.value)}
        style={{ marginTop: 0 }}
        type="time"
        value={value}
      />
    </FieldShell>
  );
}

export function DateField({ label, value, onChange, required }: DateFieldProps) {
  return (
    <FieldShell label={label} required={required}>
      <input
        className="quick-dt__native"
        onChange={(e) => onChange(e.target.value)}
        style={{ marginTop: 0 }}
        type="date"
        value={value}
      />
    </FieldShell>
  );
}
