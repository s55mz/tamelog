import { useEffect, useMemo, useRef, useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { EmptyState, Feedback } from "../components/ui";
import { apiRequest } from "../lib/api";
import { formatCurrency, formatDate, getPeriodIdClient, listPeriods } from "../lib/format";
import { getAuthToken } from "../lib/storage";
import { useToast } from "../lib/toast";
import type { AppUser } from "../lib/types";

type RecordItem = {
  id: string;
  type: string;
  amount: number;
  memo: string | null;
  recordDate: string;
  recordedAt?: string;
  emotions?: string[];
  account: { id: string; name: string };
  category: { id: string; name: string } | null;
  goal: { id: string; title: string } | null;
};

type TransferItem = {
  id: string;
  kind: string;
  amount: number;
  memo: string | null;
  recordDate: string;
  fromAccount: { id: string; name: string };
  toAccount: { id: string; name: string };
  goal: { id: string; title: string } | null;
};

type Category = { id: string; name: string; type: string };

type LedgerPageProps = {
  user: AppUser;
  onLogout: () => Promise<void>;
};

type LedgerRow = {
  id: string;
  kind: "record" | "transfer";
  sourceId: string;
  recordDate: string;
  type: string;
  accountName: string;
  categoryName: string;
  memo: string;
  amount: number;
  emotions?: string[];
};

const badgeClass: Record<string, string> = {
  INCOME: "badge badge--in",
  EXPENSE: "badge badge--out",
  SAVING: "badge badge--save",
  "SAVING-IN": "badge badge--save",
  "SAVING-OUT": "badge badge--save",
  "MOVE-IN": "badge badge--move",
  "MOVE-OUT": "badge badge--move"
};

const typeDisplay: Record<string, string> = {
  INCOME: "収入",
  EXPENSE: "支出",
  SAVING: "貯金",
  "SAVING-IN": "貯金着",
  "SAVING-OUT": "貯金元",
  "MOVE-IN": "移動先",
  "MOVE-OUT": "移動元"
};

function CalendarHeatmap({ records, periodId }: { records: RecordItem[]; periodId: string }) {
  const parts = periodId.split("-");
  const pidYear = Number(parts[0]);
  const pidMonth = Number(parts[1]);
  const pidDay = Number(parts[2]);
  const endDay = pidDay - 1;
  const endMonth = pidMonth === 12 ? 1 : pidMonth + 1;
  const periodLabel = `${pidYear}年${pidMonth}月${pidDay}日〜${endMonth}月${endDay}日`;
  // 既存のlogicalDate, year, month変数はカレンダーグリッド用に維持
  const logicalDate = new Date(Number(parts[0]), Number(parts[1]), 1); // month index trick: parts[1]="01"→1→Feb
  const year = logicalDate.getFullYear();
  const month = logicalDate.getMonth(); // 0-indexed

  const dailyTotals = useMemo(() => {
    const map: Record<string, { income: number; expense: number }> = {};
    for (const r of records) {
      const d = r.recordDate.slice(0, 10);
      map[d] ??= { income: 0, expense: 0 };
      if (r.type === "INCOME") map[d].income += r.amount;
      if (r.type === "EXPENSE") map[d].expense += r.amount;
    }
    return map;
  }, [records]);

  const today = new Date().toISOString().slice(0, 10);

  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ];

  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div>
      <p style={{ fontSize: "13px", fontWeight: 600, marginBottom: "var(--s3)", color: "var(--text-2)" }}>
        {periodLabel}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "3px", marginBottom: "var(--s2)" }}>
        {["日", "月", "火", "水", "木", "金", "土"].map((d) => (
          <div key={d} style={{ textAlign: "center", fontSize: "10px", color: "var(--text-3)", padding: "2px 0" }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "3px" }}>
        {cells.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} />;
          const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
          const data = dailyTotals[dateStr];
          const net = data ? data.income - data.expense : 0;
          const isToday = dateStr === today;
          const hasData = !!data;

          let bg = "var(--bg-2)";
          if (hasData) {
            if (net > 0) bg = "#1DC99A28";
            else if (net < 0) bg = "#EF505028";
            else bg = "var(--bg-3)";
          }

          return (
            <div
              key={dateStr}
              title={hasData ? `${dateStr}\n収入: ¥${data!.income.toLocaleString()}\n支出: ¥${data!.expense.toLocaleString()}` : dateStr}
              style={{
                aspectRatio: "1",
                borderRadius: "var(--r1)",
                background: bg,
                border: isToday ? "1.5px solid var(--amber)" : "1px solid transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                cursor: hasData ? "default" : "default",
                minHeight: 36
              }}
            >
              <span style={{ fontSize: "11px", color: isToday ? "var(--amber)" : "var(--text-2)", fontWeight: isToday ? 700 : 400 }}>
                {day}
              </span>
              {hasData ? (
                <span style={{
                  fontSize: "7px",
                  color: net > 0 ? "var(--jade)" : net < 0 ? "var(--coral)" : "var(--text-3)",
                  fontWeight: 600,
                  lineHeight: 1
                }}>
                  {net >= 0 ? "+" : "-"}{Math.abs(net).toLocaleString()}円
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div style={{ display: "flex", gap: "var(--s4)", marginTop: "var(--s3)", justifyContent: "center" }}>
        {[
          { color: "#1DC99A28", border: "#1DC99A", label: "収入超" },
          { color: "#EF505028", border: "#EF5050", label: "支出超" },
          { color: "var(--bg-2)", border: "var(--border)", label: "データなし" }
        ].map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", color: "var(--text-2)" }}>
            <div style={{ width: 12, height: 12, borderRadius: "2px", background: item.color, border: `1px solid ${item.border}` }} />
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export function LedgerPage({ user, onLogout }: LedgerPageProps) {
  const token = getAuthToken();
  const toast = useToast();
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [allRecords, setAllRecords] = useState<RecordItem[]>([]);
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [summary, setSummary] = useState({ incomeTotal: 0, expenseTotal: 0, savingTotal: 0 });
  const [tab, setTab] = useState<"list" | "calendar">("list");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvMessage, setCsvMessage] = useState("");
  const csvFileRef = useRef<HTMLInputElement>(null);

  const periods = useMemo(() => listPeriods(user.paydayOfMonth ?? 25), [user.paydayOfMonth]);
  const defaultPeriod = useMemo(
    () => getPeriodIdClient(new Date(), user.paydayOfMonth ?? 25),
    [user.paydayOfMonth]
  );
  const [periodId, setPeriodId] = useState(defaultPeriod);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadData = async () => {
    if (!token) return;
    const params = new URLSearchParams({ periodId });
    if (selectedCategoryId) params.set("categoryId", selectedCategoryId);

    const [recordsData, transfersData, categoriesData, allRecordsData] = await Promise.all([
      apiRequest<{ records: RecordItem[]; summary: typeof summary }>(`/api/records?${params.toString()}`, { token }),
      apiRequest<{ transfers: TransferItem[] }>(`/api/account-transfers?periodId=${periodId}`, { token }),
      apiRequest<{ categories: Category[] }>("/api/categories", { token }),
      apiRequest<{ records: RecordItem[] }>(`/api/records?periodId=${periodId}&all=true`, { token })
    ]);
    setRecords(recordsData.records);
    setSummary(recordsData.summary);
    setTransfers(transfersData.transfers);
    setCategories(categoriesData.categories);
    setAllRecords(allRecordsData.records);
  };

  useEffect(() => { void loadData(); }, [token, periodId, selectedCategoryId]);

  const exportCsv = async () => {
    if (!token) return;
    const res = await fetch("/api/csv/export", { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tamelog-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = async (file: File) => {
    if (!token) return;
    setCsvImporting(true);
    setCsvMessage("");
    try {
      const text = await file.text();
      const res = await apiRequest<{ imported: number; total: number }>("/api/csv/import", {
        method: "POST", token,
        body: { csvText: text, format: "auto" }
      });
      setCsvMessage(`${res.imported}件をインポートしました`);
      await loadData();
    } catch (err) {
      setCsvMessage(err instanceof Error ? err.message : "インポートに失敗しました");
    } finally {
      setCsvImporting(false);
    }
  };

  const deleteRow = async (row: LedgerRow) => {
    if (!token) return;
    try {
      await apiRequest(
        row.kind === "record" ? `/api/records/${row.sourceId}` : `/api/account-transfers/${row.sourceId}`,
        { method: "DELETE", token }
      );
      toast("削除しました");
      await loadData();
    } catch (nextError) {
      toast(nextError instanceof Error ? nextError.message : "削除に失敗しました", "err");
    }
  };

  const rows = useMemo<LedgerRow[]>(
    () =>
      [
        ...records.map((record) => ({
          id: `record-${record.id}`,
          kind: "record" as const,
          sourceId: record.id,
          recordDate: record.recordDate,
          type: record.type,
          accountName: record.account.name,
          categoryName: record.category?.name ?? record.goal?.title ?? "-",
          memo: record.memo ?? "",
          amount: record.type === "EXPENSE" ? -record.amount : record.amount,
          emotions: record.emotions
        })),
        ...transfers.flatMap((transfer) => [
          {
            id: `transfer-from-${transfer.id}`,
            kind: "transfer" as const,
            sourceId: transfer.id,
            recordDate: transfer.recordDate,
            type: transfer.kind === "SAVING" ? "SAVING-OUT" : "MOVE-OUT",
            accountName: transfer.fromAccount.name,
            categoryName: transfer.kind === "SAVING" ? `目標 ${transfer.goal?.title ?? "-"}` : "移動元",
            memo: transfer.memo ?? "",
            amount: -transfer.amount
          },
          {
            id: `transfer-to-${transfer.id}`,
            kind: "transfer" as const,
            sourceId: transfer.id,
            recordDate: transfer.recordDate,
            type: transfer.kind === "SAVING" ? "SAVING-IN" : "MOVE-IN",
            accountName: transfer.toAccount.name,
            categoryName: transfer.kind === "SAVING" ? `着地 ${transfer.goal?.title ?? "-"}` : "移動先",
            memo: transfer.memo ?? "",
            amount: transfer.amount
          }
        ])
      ].sort((left, right) => right.recordDate.localeCompare(left.recordDate)),
    [records, transfers]
  );

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === "EXPENSE"),
    [categories]
  );

  const currentPeriodLabel = periods.find((p) => p.id === periodId)?.label ?? periodId;

  return (
    <AppLayout
      onLogout={onLogout}
      subtitle="今期の収支と移動履歴を、一覧とカレンダーで確認します。"
      title="家計簿"
      user={user}
    >
      {/* ── CSV Import/Export ──────────────────────────── */}
      <div className="card card--row" style={{ padding: "14px 18px" }}>
        <p className="eyebrow">CSV</p>
        <input
          ref={csvFileRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importCsv(f);
            e.target.value = "";
          }}
        />
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          {csvMessage ? <span style={{ fontSize: "12px", color: "var(--brand)" }}>{csvMessage}</span> : null}
          <button className="btn btn--out btn--sm" onClick={() => void exportCsv()} type="button">
            <span className="material-symbols-outlined">download</span>エクスポート
          </button>
          <button className="btn btn--out btn--sm" disabled={csvImporting} onClick={() => csvFileRef.current?.click()} type="button">
            <span className="material-symbols-outlined">upload</span>
            {csvImporting ? "インポート中..." : "インポート"}
          </button>
        </div>
      </div>

      {/* ── Period selector ────────────────────────────── */}
      <div className="row" style={{ gap: "var(--s2)" }}>
        <label className="field" style={{ flex: 1, margin: 0 }}>
          <select
            value={periodId}
            onChange={(event) => setPeriodId(event.target.value)}
            style={{ fontWeight: 600 }}
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* ── Summary stats ──────────────────────────────── */}
      <div className="three-up">
        <div className="card">
          <div className="stat">
            <p className="stat__label">収入</p>
            <p className="stat__value stat__value--jade">{formatCurrency(summary.incomeTotal)}</p>
          </div>
        </div>
        <div className="card">
          <div className="stat">
            <p className="stat__label">支出</p>
            <p className="stat__value stat__value--coral">{formatCurrency(summary.expenseTotal)}</p>
          </div>
        </div>
        <div className="card">
          <div className="stat">
            <p className="stat__label">貯金</p>
            <p className="stat__value stat__value--amber">{formatCurrency(summary.savingTotal)}</p>
          </div>
        </div>
      </div>

      {/* ── Tab selector ───────────────────────────────── */}
      <div className="seg">
        <button
          className={`seg__btn ${tab === "list" ? "on" : ""}`}
          onClick={() => setTab("list")}
          type="button"
        >
          一覧
        </button>
        <button
          className={`seg__btn ${tab === "calendar" ? "on" : ""}`}
          onClick={() => setTab("calendar")}
          type="button"
        >
          カレンダー
        </button>
      </div>

      {/* ── List tab ───────────────────────────────────── */}
      {tab === "list" ? (
        <>
          {/* Category filter */}
          {expenseCategories.length > 0 ? (
            <div>
              <p className="field__label" style={{ marginBottom: "var(--s2)" }}>カテゴリで絞り込み</p>
              <div className="chip-group">
                <button
                  className={`chip ${selectedCategoryId === "" ? "on" : ""}`}
                  onClick={() => setSelectedCategoryId("")}
                  type="button"
                >
                  すべて
                </button>
                {expenseCategories.map((cat) => (
                  <button
                    className={`chip ${selectedCategoryId === cat.id ? "on" : ""}`}
                    key={cat.id}
                    onClick={() => setSelectedCategoryId(selectedCategoryId === cat.id ? "" : cat.id)}
                    type="button"
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Timeline */}
          <div>
            <p className="eyebrow" style={{ marginBottom: "var(--s3)" }}>
              {currentPeriodLabel} の記録
            </p>
            {rows.length ? (
              <div className="entry-list">
                {rows.map((row) => (
                  <div className="entry" key={row.id} style={{ flexWrap: "wrap", gap: "var(--s2)" }}>
                    <span className={badgeClass[row.type] ?? "badge"}>
                      {typeDisplay[row.type] ?? row.type}
                    </span>
                    <div className="entry__body" style={{ minWidth: "120px" }}>
                      <p className="entry__title">{row.accountName}</p>
                      <p className="entry__sub">
                        {row.categoryName}{row.memo ? ` · ${row.memo}` : ""}
                      </p>
                      {row.emotions && row.emotions.length > 0 ? (
                        <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px" }}>
                          {row.emotions.join(" · ")}
                        </p>
                      ) : null}
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <p
                        className="entry__amount"
                        style={{ color: row.amount >= 0 ? "var(--jade)" : "var(--coral)" }}
                      >
                        {row.amount >= 0 ? "+" : ""}{formatCurrency(row.amount)}
                      </p>
                      <p className="entry__meta">{formatDate(row.recordDate)}</p>
                    </div>
                    <button className="btn btn--del btn--sm" onClick={() => void deleteRow(row)} type="button" style={{ flexShrink: 0 }}>
                      削除
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState>この期間の記録はありません。</EmptyState>
            )}
          </div>
        </>
      ) : null}

      {/* ── Calendar tab ───────────────────────────────── */}
      {tab === "calendar" ? (
        <div className="card">
          <CalendarHeatmap records={allRecords} periodId={periodId} />
        </div>
      ) : null}

      {message ? <Feedback kind="ok">{message}</Feedback> : null}
      {error ? <Feedback kind="err">{error}</Feedback> : null}
    </AppLayout>
  );
}
