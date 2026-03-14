export function formatCurrency(value: number) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0
  }).format(value);
}

export function formatDate(value: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric"
  }).format(date);
}

export function formatDateTime(value: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

/** YYYY/MM/DD HH:mm format for records */
export function formatDateTimeJP(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
}

export function getInitials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

/** Client-side period ID calculation (mirrors server lib/period.ts) */
function getLastDayOfMonthLocal(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getEffectivePaydayLocal(year: number, month: number, paydayOfMonth: number) {
  return Math.min(paydayOfMonth, getLastDayOfMonthLocal(year, month));
}

export function getPeriodIdClient(date: Date, paydayOfMonth: number): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const currentPayday = getEffectivePaydayLocal(year, month, paydayOfMonth);

  if (day >= currentPayday) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(currentPayday).padStart(2, "0")}`;
  }

  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const prevPayday = getEffectivePaydayLocal(prevYear, prevMonth, paydayOfMonth);

  return `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${String(prevPayday).padStart(2, "0")}`;
}

/** Generate list of past N months of periods */
export function listPeriods(
  paydayOfMonth: number,
  monthsBack: number = 12
): Array<{ id: string; label: string }> {
  const seen = new Set<string>();
  const periods: Array<{ id: string; label: string }> = [];
  const now = new Date();

  for (let i = monthsBack; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 15);
    const id = getPeriodIdClient(d, paydayOfMonth);
    if (!seen.has(id)) {
      seen.add(id);
      const parts = id.split("-");
      const y = parts[0];
      const m = String(Number(parts[1]));
      periods.push({ id, label: `${y}年${m}月期` });
    }
  }

  return periods;
}
