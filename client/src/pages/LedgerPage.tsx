import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Search, Calendar, Pencil, Trash2 } from "lucide-react";

import { AppLayout } from "../components/AppLayout";
import { EmptyState, Feedback } from "../components/ui";
import { apiRequest } from "../lib/api";
import { useAutoRefresh } from "../lib/autoRefresh";
import { formatCurrency, getPeriodIdClient } from "../lib/format";
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
type Account = { id: string; name: string; type: string };
type Goal = { id: string; title: string };

type LedgerPageProps = {
  user: AppUser;
  onLogout: () => Promise<void>;
};

type LedgerRow = {
  id: string;
  kind: "record" | "transfer";
  sourceId: string;
  recordDate: string;
  recordedAt?: string;
  type: string;
  accountName: string;
  categoryName: string;
  memo: string;
  amount: number;
  emotions?: string[];
};

type TypeFilter = "all" | "INCOME" | "EXPENSE" | "SAVING";

const EMOTIONS = ["嬉しい", "衝動的", "不安", "必要", "疲れた", "後悔"];

function isTimeSet(recordedAt?: string): boolean {
  if (!recordedAt) return false;
  const d = new Date(recordedAt);
  return d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0 || d.getUTCSeconds() !== 0;
}

function formatTimeOnly(recordedAt: string): string {
  const d = new Date(recordedAt);
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function getDateLabel(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yd = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dateStr === today) return "今日";
  if (dateStr === yd) return "昨日";
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function getDateSub(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function getRowIcon(row: LedgerRow): { emoji: string; bg: string } {
  if (row.type === "INCOME") return { emoji: "💴", bg: "#D1FAE5" };
  if (row.type.includes("SAVING")) return { emoji: "🐷", bg: "#DBEAFE" };
  if (row.type.includes("MOVE")) return { emoji: "↔️", bg: "#EDE9FE" };

  const name = (row.categoryName + " " + row.memo).toLowerCase();
  if (name.match(/食|ランチ|夕食|朝食|外食|カフェ|コンビニ|弁当/))
    return { emoji: "🍴", bg: "#FEF3C7" };
  if (name.match(/交通|電車|バス|ic|鉄道|タクシー|駐車/))
    return { emoji: "🚃", bg: "#E0E7FF" };
  if (name.match(/医|薬|病院|健康|ドラッグ|美容|化粧/))
    return { emoji: "💊", bg: "#FCE7F3" };
  if (name.match(/スーパー|日用|生活|雑貨|ホーム/))
    return { emoji: "🛒", bg: "#EDE9FE" };
  if (name.match(/娯楽|趣味|ゲーム|映画|音楽|本|書籍/))
    return { emoji: "🎮", bg: "#FEE2E2" };
  if (name.match(/衣|服|ファッション|アパレル|靴/))
    return { emoji: "👕", bg: "#FCE7F3" };
  if (name.match(/光熱|電気|ガス|水道|公共/))
    return { emoji: "💡", bg: "#FFF7ED" };
  if (name.match(/通信|携帯|スマホ|ネット|wifi/))
    return { emoji: "📱", bg: "#F0F9FF" };
  if (name.match(/家賃|住宅|マンション|アパート/))
    return { emoji: "🏠", bg: "#F0FDF4" };
  if (name.match(/給与|給料|賞与|ボーナス|収入/))
    return { emoji: "💴", bg: "#D1FAE5" };

  return { emoji: "📝", bg: "#F3F4F6" };
}

// ── CalendarMonthGrid ─────────────────────────────────────────

function CalendarMonthGrid({
  year, month, startDay, endDay, dailyTotals, today, maxExpense, maxIncome
}: {
  year: number; month: number; startDay: number; endDay: number;
  dailyTotals: Record<string, { income: number; expense: number }>;
  today: string; maxExpense: number; maxIncome: number;
}) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ];

  return (
    <div>
      <p style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-2)", marginBottom: "var(--s2)" }}>
        {year}年{month + 1}月
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "3px", marginBottom: "var(--s1)" }}>
        {["日", "月", "火", "水", "木", "金", "土"].map((d) => (
          <div key={d} style={{ textAlign: "center", fontSize: "10px", color: "var(--text-3)", padding: "2px 0" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "3px" }}>
        {cells.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} />;
          const inPeriod = day >= startDay && day <= endDay;
          const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
          const data = dailyTotals[dateStr];
          const net = data ? data.income - data.expense : 0;
          const isToday = dateStr === today;

          let bg = inPeriod ? "var(--bg-2)" : "transparent";
          let opacity = inPeriod ? 1 : 0.3;
          if (inPeriod && data) {
            if (net > 0) {
              const intensity = maxIncome > 0 ? Math.max(0.15, data.income / maxIncome) : 0.3;
              const alpha = Math.round(intensity * 200).toString(16).padStart(2, "0");
              bg = `#1DC99A${alpha}`;
            } else if (net < 0) {
              const intensity = maxExpense > 0 ? Math.max(0.15, data.expense / maxExpense) : 0.3;
              const alpha = Math.round(intensity * 200).toString(16).padStart(2, "0");
              bg = `#EF5050${alpha}`;
            } else {
              bg = "var(--bg-3)";
            }
            opacity = 1;
          }

          return (
            <div
              key={dateStr}
              title={data ? `${dateStr}\n収入: ¥${data.income.toLocaleString()}\n支出: ¥${data.expense.toLocaleString()}` : dateStr}
              style={{
                aspectRatio: "1", borderRadius: "var(--r1)", background: bg, opacity,
                border: isToday ? "1.5px solid var(--amber)" : "1px solid transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexDirection: "column", minHeight: 32
              }}
            >
              <span style={{ fontSize: "11px", color: isToday ? "var(--amber)" : "var(--text-2)", fontWeight: isToday ? 700 : 400 }}>
                {day}
              </span>
              {inPeriod && data ? (
                <span style={{ fontSize: "7px", color: net > 0 ? "var(--jade)" : net < 0 ? "var(--coral)" : "var(--text-3)", fontWeight: 600, lineHeight: 1 }}>
                  {net >= 0 ? "+" : "-"}{Math.abs(net).toLocaleString()}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalendarHeatmap({ records, periodId }: { records: RecordItem[]; periodId: string }) {
  const [startYear, startMonth, startDay] = periodId.split("-").map(Number);
  const endMonthIdx = startMonth === 12 ? 0 : startMonth;
  const endYear = startMonth === 12 ? startYear + 1 : startYear;
  const daysInEndMonth = new Date(endYear, endMonthIdx + 1, 0).getDate();
  const endDay = Math.min(startDay - 1, daysInEndMonth) || daysInEndMonth;

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

  const { maxExpense, maxIncome } = useMemo(() => {
    let me = 0; let mi = 0;
    for (const v of Object.values(dailyTotals)) {
      if (v.expense > me) me = v.expense;
      if (v.income > mi) mi = v.income;
    }
    return { maxExpense: me, maxIncome: mi };
  }, [dailyTotals]);

  const today = new Date().toISOString().slice(0, 10);
  const startMonthIdx = startMonth - 1;
  const isSameMonth = startYear === endYear && startMonthIdx === endMonthIdx;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s4)" }}>
      <CalendarMonthGrid
        year={startYear} month={startMonthIdx}
        startDay={startDay} endDay={new Date(startYear, startMonthIdx + 1, 0).getDate()}
        dailyTotals={dailyTotals} today={today}
        maxExpense={maxExpense} maxIncome={maxIncome}
      />
      {!isSameMonth ? (
        <CalendarMonthGrid
          year={endYear} month={endMonthIdx}
          startDay={1} endDay={endDay}
          dailyTotals={dailyTotals} today={today}
          maxExpense={maxExpense} maxIncome={maxIncome}
        />
      ) : null}
      <div style={{ display: "flex", gap: "var(--s4)", justifyContent: "center" }}>
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

// ── Main page ─────────────────────────────────────────────────

export function LedgerPage({ user, onLogout }: LedgerPageProps) {
  const token = getAuthToken();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [allRecords, setAllRecords] = useState<RecordItem[]>([]);
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);

  type EditForm = {
    type: "INCOME" | "EXPENSE" | "SAVING";
    accountId: string;
    categoryId: string;
    goalId: string;
    amount: string;
    memo: string;
    recordDate: string;
    recordedAt: string;
    emotions: string[];
  };
  const [editRecord, setEditRecord] = useState<RecordItem | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ type: "EXPENSE", accountId: "", categoryId: "", goalId: "", amount: "", memo: "", recordDate: "", recordedAt: "", emotions: [] });
  const [editSaving, setEditSaving] = useState(false);

  type TransferForm = {
    kind: "TRANSFER" | "SAVING";
    fromAccountId: string;
    toAccountId: string;
    goalId: string;
    amount: string;
    memo: string;
    recordDate: string;
  };
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState<TransferForm>({
    kind: "TRANSFER", fromAccountId: "", toAccountId: "", goalId: "", amount: "", memo: "",
    recordDate: new Date().toISOString().slice(0, 10)
  });
  const [transferKindUi, setTransferKindUi] = useState<"TRANSFER" | "SAVING" | "WITHDRAW">("TRANSFER");
  const [transferSaving, setTransferSaving] = useState(false);

  type ImportResult = { imported: number; total: number; failed: Array<{ line: number; reason: string; raw: string }> };
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [summary, setSummary] = useState({ incomeTotal: 0, expenseTotal: 0, savingTotal: 0 });
  const [periodLoading, setPeriodLoading] = useState(false);
  const [tab, setTab] = useState<"list" | "calendar">("list");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvMessage, setCsvMessage] = useState("");
  const csvFileRef = useRef<HTMLInputElement>(null);

  const [periods, setPeriods] = useState<Array<{ id: string; label: string }>>([]);
  const defaultPeriod = useMemo(
    () => getPeriodIdClient(new Date(), user.paydayOfMonth ?? 25),
    [user.paydayOfMonth]
  );
  const initialPeriodId = searchParams.get("periodId") ?? defaultPeriod;
  const [periodId, setPeriodId] = useState(initialPeriodId);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    void apiRequest<{ periods: Array<{ id: string; label: string }> }>("/api/records/periods", { token })
      .then((data) => setPeriods(data.periods));
  }, [token]);

  const loadData = async (showLoading = false) => {
    if (!token) return;
    if (showLoading) setPeriodLoading(true);
    const params = new URLSearchParams({ periodId, all: "true" });

    try {
      const [recordsData, transfersData, categoriesData, accountsData, goalsData] = await Promise.all([
        apiRequest<{ records: RecordItem[]; summary: typeof summary }>(`/api/records?${params.toString()}`, { token }),
        apiRequest<{ transfers: TransferItem[] }>(`/api/account-transfers?periodId=${periodId}&limit=9999`, { token }),
        apiRequest<{ categories: Category[] }>("/api/categories", { token }),
        apiRequest<{ accounts: Account[] }>("/api/accounts", { token }),
        apiRequest<{ goals: Goal[] }>("/api/goals", { token })
      ]);
      setRecords(recordsData.records);
      setSummary(recordsData.summary);
      setTransfers(transfersData.transfers);
      setCategories(categoriesData.categories);
      setAccounts(accountsData.accounts);
      setGoals(goalsData.goals);
      setAllRecords(recordsData.records);
    } finally {
      setPeriodLoading(false);
    }
  };

  useEffect(() => { void loadData(true); }, [token, periodId]);
  useAutoRefresh(loadData);

  useEffect(() => {
    const requestedPeriodId = searchParams.get("periodId");
    if (requestedPeriodId && requestedPeriodId !== periodId) {
      setPeriodId(requestedPeriodId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    if (nextParams.get("periodId") === periodId) return;
    nextParams.set("periodId", periodId);
    setSearchParams(nextParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodId]);

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

  const downloadTemplate = () => {
    const header = "日付,種別,金額,取引先/メモ,カテゴリ/元口座,口座/移動先,目標,時刻,感情";
    const today = new Date().toISOString().slice(0, 10);
    const expenseCats = categories.filter((c) => c.type === "EXPENSE");
    const incomeCats = categories.filter((c) => c.type === "INCOME");
    const rows: string[] = [
      ...accounts.flatMap((acc) =>
        expenseCats.length
          ? expenseCats.map((cat) => `${today},EXPENSE,3000,コンビニ,${cat.name},${acc.name},,19:30,衝動的`)
          : [`${today},EXPENSE,3000,コンビニ,,${acc.name},,,`]
      ),
      ...accounts.flatMap((acc) =>
        incomeCats.length
          ? incomeCats.map((cat) => `${today},INCOME,200000,会社,${cat.name},${acc.name},,,`)
          : [`${today},INCOME,200000,会社,,${acc.name},,,`]
      ),
      ...accounts.flatMap((acc, i) => {
        const toAcc = accounts[(i + 1) % accounts.length];
        return toAcc && toAcc.id !== acc.id ? [`${today},TRANSFER,10000,口座移動,${acc.name},${toAcc.name},,,`] : [];
      }).slice(0, 2),
      ...accounts.flatMap((acc, i) => {
        const toAcc = accounts[(i + 1) % accounts.length];
        return toAcc && toAcc.id !== acc.id && goals.length ? [`${today},SAVING-MOVE,5000,貯金,${acc.name},${toAcc.name},${goals[0]?.title ?? ""},,`] : [];
      }).slice(0, 1)
    ];
    const csv = "\uFEFF" + [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tamelog-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = async (file: File) => {
    if (!token) return;
    setCsvImporting(true);
    setCsvMessage("");
    try {
      const text = await file.text();
      const res = await apiRequest<ImportResult>("/api/csv/import", {
        method: "POST", token,
        body: { csvText: text, format: "auto" }
      });
      setImportResult(res);
      await loadData();
    } catch (err) {
      setCsvMessage(err instanceof Error ? err.message : "インポートに失敗しました");
    } finally {
      setCsvImporting(false);
    }
  };

  const openEdit = (record: RecordItem) => {
    setEditRecord(record);
    let timeOnly = "";
    if (record.recordedAt && isTimeSet(record.recordedAt)) {
      const d = new Date(record.recordedAt);
      const pad = (n: number) => String(n).padStart(2, "0");
      timeOnly = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    setEditForm({
      type: record.type as "INCOME" | "EXPENSE" | "SAVING",
      accountId: record.account.id,
      categoryId: record.category?.id ?? "",
      goalId: record.goal?.id ?? "",
      amount: String(record.amount),
      memo: record.memo ?? "",
      recordDate: record.recordDate.slice(0, 10),
      recordedAt: timeOnly,
      emotions: record.emotions ?? []
    });
  };

  const submitEdit = async () => {
    if (!token || !editRecord) return;
    setEditSaving(true);
    try {
      await apiRequest(`/api/records/${editRecord.id}`, {
        method: "PUT", token,
        body: {
          type: editForm.type,
          accountId: editForm.accountId,
          categoryId: editForm.categoryId || null,
          goalId: editForm.type === "SAVING" ? (editForm.goalId || null) : null,
          amount: Math.abs(Number(editForm.amount)),
          memo: editForm.memo || null,
          recordDate: editForm.recordDate,
          recordedAt: editForm.recordedAt
            ? new Date(`${editForm.recordDate}T${editForm.recordedAt}:00`).toISOString()
            : null,
          emotions: editForm.emotions
        }
      });
      toast("更新しました");
      setEditRecord(null);
      await loadData();
    } catch (err) {
      toast(err instanceof Error ? err.message : "更新に失敗しました", "err");
    } finally {
      setEditSaving(false);
    }
  };

  const createTransfer = async () => {
    if (!token) return;
    setTransferSaving(true);
    try {
      await apiRequest("/api/account-transfers", {
        method: "POST", token,
        body: {
          fromAccountId: transferForm.fromAccountId,
          toAccountId: transferForm.toAccountId,
          goalId: transferForm.kind === "SAVING" ? (transferForm.goalId || null) : null,
          kind: transferForm.kind,
          amount: Math.abs(Number(transferForm.amount)),
          memo: transferForm.memo || null,
          recordDate: transferForm.recordDate
        }
      });
      toast("移動を保存しました");
      setShowTransferModal(false);
      setTransferForm({ kind: "TRANSFER", fromAccountId: accounts[0]?.id ?? "", toAccountId: accounts[1]?.id ?? accounts[0]?.id ?? "", goalId: "", amount: "", memo: "", recordDate: new Date().toISOString().slice(0, 10) });
      setTransferKindUi("TRANSFER");
      await loadData();
    } catch (err) {
      toast(err instanceof Error ? err.message : "保存に失敗しました", "err");
    } finally {
      setTransferSaving(false);
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
          recordedAt: record.recordedAt,
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
            recordedAt: undefined as string | undefined,
            type: transfer.kind === "SAVING" ? "SAVING-OUT" : "MOVE-OUT",
            accountName: transfer.fromAccount.name,
            categoryName: transfer.kind === "SAVING" ? `目標 ${transfer.goal?.title ?? "-"}` : "移動元",
            memo: transfer.memo ?? "",
            amount: -transfer.amount,
            emotions: undefined as string[] | undefined
          },
          {
            id: `transfer-to-${transfer.id}`,
            kind: "transfer" as const,
            sourceId: transfer.id,
            recordDate: transfer.recordDate,
            recordedAt: undefined as string | undefined,
            type: transfer.kind === "SAVING" ? "SAVING-IN" : "MOVE-IN",
            accountName: transfer.toAccount.name,
            categoryName: transfer.kind === "SAVING" ? `着地 ${transfer.goal?.title ?? "-"}` : "移動先",
            memo: transfer.memo ?? "",
            amount: transfer.amount,
            emotions: undefined as string[] | undefined
          }
        ])
      ].sort((left, right) => {
        const dateCompare = right.recordDate.localeCompare(left.recordDate);
        if (dateCompare !== 0) return dateCompare;
        const lt = left.recordedAt ?? `${left.recordDate}T00:00:00Z`;
        const rt = right.recordedAt ?? `${right.recordDate}T00:00:00Z`;
        return rt.localeCompare(lt);
      }),
    [records, transfers]
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (typeFilter === "INCOME" && row.type !== "INCOME") return false;
      if (typeFilter === "EXPENSE" && row.type !== "EXPENSE") return false;
      if (typeFilter === "SAVING" && !["SAVING", "SAVING-IN", "SAVING-OUT"].includes(row.type)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!row.categoryName.toLowerCase().includes(q) && !row.memo.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, typeFilter, searchQuery]);

  const groupedByDate = useMemo(() => {
    const map = new Map<string, LedgerRow[]>();
    for (const row of filteredRows) {
      const date = row.recordDate.slice(0, 10);
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(row);
    }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [filteredRows]);

  const displaySavingTotal = useMemo(
    () => summary.savingTotal + transfers.filter((t) => t.kind === "SAVING").reduce((s, t) => s + t.amount, 0),
    [summary.savingTotal, transfers]
  );

  const currentPeriodLabel = periods.find((p) => p.id === periodId)?.label ?? periodId;

  const periodIdx = periods.findIndex((p) => p.id === periodId);
  const canPrev = periodIdx < periods.length - 1;
  const canNext = periodIdx > 0;

  const TYPE_FILTERS: { id: TypeFilter; label: string }[] = [
    { id: "all",     label: "すべて" },
    { id: "EXPENSE", label: "支出" },
    { id: "INCOME",  label: "収入" },
    { id: "SAVING",  label: "貯金" },
  ];

  return (
    <AppLayout
      onLogout={onLogout}
      title="取引履歴"
      user={user}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 0, paddingBottom: "var(--s6)" }}>

        {/* ── Period bar ──────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", gap: "var(--s2)",
          padding: "var(--s3) var(--s4)", background: "var(--bg-1)",
          borderBottom: "1px solid var(--border)"
        }}>
          <button
            type="button"
            onClick={() => canPrev && setPeriodId(periods[periodIdx + 1]!.id)}
            disabled={!canPrev}
            aria-label="前の期間"
            style={{
              width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: "var(--r2)", border: "none", background: "transparent",
              color: canPrev ? "var(--text)" : "var(--text-3)", cursor: canPrev ? "pointer" : "default"
            }}
          >
            <ChevronLeft size={18} strokeWidth={2.5} />
          </button>

          <div style={{ flex: 1, textAlign: "center" }}>
            {periods.length > 0 ? (
              <select
                value={periodId}
                onChange={(e) => setPeriodId(e.target.value)}
                style={{
                  border: "none", background: "transparent", fontWeight: 600,
                  fontSize: "15px", color: "var(--text)", textAlign: "center",
                  cursor: "pointer", outline: "none"
                }}
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            ) : (
              <span style={{ fontWeight: 600, fontSize: "15px", color: "var(--text)" }}>{currentPeriodLabel}</span>
            )}
          </div>

          <button
            type="button"
            onClick={() => canNext && setPeriodId(periods[periodIdx - 1]!.id)}
            disabled={!canNext}
            aria-label="次の期間"
            style={{
              width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: "var(--r2)", border: "none", background: "transparent",
              color: canNext ? "var(--text)" : "var(--text-3)", cursor: canNext ? "pointer" : "default"
            }}
          >
            <ChevronRight size={18} strokeWidth={2.5} />
          </button>

          <button
            type="button"
            onClick={() => setTab(tab === "list" ? "calendar" : "list")}
            aria-label="カレンダー表示"
            style={{
              width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: "var(--r2)", border: "none",
              background: tab === "calendar" ? "var(--brand-soft)" : "transparent",
              color: tab === "calendar" ? "var(--brand)" : "var(--text-2)", cursor: "pointer"
            }}
          >
            <Calendar size={17} strokeWidth={2} />
          </button>
        </div>

        {/* ── List tab ────────────────────────────────────────── */}
        {tab === "list" ? (
          <>
            {/* Search bar */}
            <div style={{ padding: "var(--s3) var(--s4)", background: "var(--bg-1)", borderBottom: "1px solid var(--border)" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: "var(--s2)",
                background: "var(--bg-2)", borderRadius: 999,
                padding: "var(--s2) var(--s3)"
              }}>
                <Search size={15} color="var(--text-3)" strokeWidth={2} />
                <input
                  type="text"
                  placeholder="カテゴリやメモで検索"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    flex: 1, border: "none", background: "transparent", outline: "none",
                    fontSize: "14px", color: "var(--text)"
                  }}
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    style={{ border: "none", background: "transparent", color: "var(--text-3)", cursor: "pointer", padding: 0, lineHeight: 1 }}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            </div>

            {/* Type filter chips */}
            <div style={{
              display: "flex", gap: "var(--s2)", padding: "var(--s3) var(--s4)",
              background: "var(--bg-1)", borderBottom: "1px solid var(--border)",
              overflowX: "auto"
            }}>
              {TYPE_FILTERS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTypeFilter(id)}
                  style={{
                    padding: "6px 16px", borderRadius: 999, border: "none", cursor: "pointer",
                    fontSize: "13px", fontWeight: 500, whiteSpace: "nowrap",
                    background: typeFilter === id ? "var(--brand)" : "var(--bg-2)",
                    color: typeFilter === id ? "#fff" : "var(--text-2)",
                    transition: "all 150ms"
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Summary bar */}
            <div style={{
              display: "flex", gap: 0,
              background: "var(--bg-1)", borderBottom: "1px solid var(--border)",
              opacity: periodLoading ? 0.5 : 1, transition: "opacity 200ms"
            }}>
              {[
                { label: "収入", value: summary.incomeTotal, color: "var(--jade)" },
                { label: "支出", value: summary.expenseTotal, color: "var(--coral)" },
                { label: "貯金", value: displaySavingTotal, color: "var(--amber)" },
              ].map(({ label, value, color }, i) => (
                <div key={label} style={{
                  flex: 1, padding: "var(--s3) var(--s2)", textAlign: "center",
                  borderRight: i < 2 ? "1px solid var(--border)" : "none"
                }}>
                  <p style={{ fontSize: "11px", color: "var(--text-3)", marginBottom: 2 }}>{label}</p>
                  <p style={{ fontSize: "14px", fontWeight: 700, color }}>{formatCurrency(value)}</p>
                </div>
              ))}
            </div>

            {/* Date-grouped list */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              {groupedByDate.length === 0 ? (
                <div style={{ padding: "var(--s7) var(--s4)" }}>
                  <EmptyState>この期間の記録はありません。</EmptyState>
                </div>
              ) : (
                groupedByDate.map(([date, dateRows]) => {
                  const dailyNet = dateRows.reduce((s, r) => s + r.amount, 0);
                  return (
                    <div key={date}>
                      {/* Date section header */}
                      <div style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "var(--s3) var(--s4) var(--s2)",
                        borderLeft: "3px solid var(--brand)",
                        marginLeft: "var(--s4)",
                        marginRight: "var(--s4)",
                        marginTop: "var(--s4)"
                      }}>
                        <div style={{ paddingLeft: "var(--s3)" }}>
                          <p style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)", lineHeight: 1.2 }}>
                            {getDateLabel(date)}
                          </p>
                          <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: 2 }}>
                            {getDateSub(date)}
                          </p>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <p style={{ fontSize: "10px", color: "var(--text-3)", marginBottom: 2 }}>日計</p>
                          <p style={{
                            fontSize: "14px", fontWeight: 700,
                            color: dailyNet >= 0 ? "var(--jade)" : "var(--coral)"
                          }}>
                            {dailyNet >= 0 ? "+" : ""}{formatCurrency(dailyNet)}
                          </p>
                        </div>
                      </div>

                      {/* Transaction rows */}
                      <div style={{
                        background: "var(--bg-1)",
                        margin: "var(--s2) var(--s4) 0",
                        borderRadius: "var(--r3)",
                        overflow: "hidden",
                        boxShadow: "var(--shadow-xs)"
                      }}>
                        {dateRows.map((row, idx) => {
                          const { emoji, bg } = getRowIcon(row);
                          const title = row.memo || row.categoryName;
                          const sub = row.memo ? row.categoryName : row.accountName;
                          const isPositive = row.amount >= 0;

                          return (
                            <div
                              key={row.id}
                              style={{
                                display: "flex", alignItems: "center", gap: "var(--s3)",
                                padding: "var(--s3) var(--s4)",
                                borderTop: idx > 0 ? "1px solid var(--border)" : "none",
                              }}
                            >
                              {/* Icon circle */}
                              <div style={{
                                width: 44, height: 44, borderRadius: "50%",
                                background: bg,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: "20px", flexShrink: 0
                              }}>
                                {emoji}
                              </div>

                              {/* Info */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{
                                  fontSize: "14px", fontWeight: 600, color: "var(--text)",
                                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                                }}>
                                  {title}
                                </p>
                                <p style={{ fontSize: "12px", color: "var(--text-2)", marginTop: 1 }}>
                                  {sub}
                                  {row.recordedAt && isTimeSet(row.recordedAt)
                                    ? ` · ${formatTimeOnly(row.recordedAt)}` : ""}
                                </p>
                              </div>

                              {/* Amount + actions */}
                              <div style={{ display: "flex", alignItems: "center", gap: "var(--s2)", flexShrink: 0 }}>
                                <p style={{
                                  fontSize: "15px", fontWeight: 700,
                                  color: isPositive ? "var(--jade)" : "var(--coral)",
                                  fontVariantNumeric: "tabular-nums"
                                }}>
                                  {isPositive ? "+" : ""}{formatCurrency(row.amount)}
                                </p>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                  {row.kind === "record" ? (
                                    <button
                                      type="button"
                                      aria-label="編集"
                                      onClick={() => {
                                        const rec = records.find((r) => r.id === row.sourceId);
                                        if (rec) openEdit(rec);
                                      }}
                                      style={{
                                        width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                                        borderRadius: "var(--r1)", border: "1px solid var(--border)",
                                        background: "var(--bg-2)", color: "var(--text-2)", cursor: "pointer"
                                      }}
                                    >
                                      <Pencil size={12} strokeWidth={2} />
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    aria-label="削除"
                                    onClick={() => void deleteRow(row)}
                                    style={{
                                      width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                                      borderRadius: "var(--r1)", border: "1px solid var(--border)",
                                      background: "var(--bg-2)", color: "var(--coral)", cursor: "pointer"
                                    }}
                                  >
                                    <Trash2 size={12} strokeWidth={2} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* ── 口座移動 + CSV ──────────────────────────── */}
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--s3)", padding: "var(--s5) var(--s4) var(--s4)" }}>
              <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--s3)" }}>
                <div>
                  <p className="eyebrow">口座移動</p>
                  <p style={{ fontSize: "12px", color: "var(--text-2)", marginTop: 2 }}>現金・銀行・貯金口座の移動を記録</p>
                </div>
                <button
                  className="btn btn--out"
                  onClick={() => {
                    setTransferForm(f => ({
                      ...f,
                      fromAccountId: f.fromAccountId || accounts[0]?.id || "",
                      toAccountId: f.toAccountId || accounts[1]?.id || accounts[0]?.id || "",
                      recordDate: new Date().toISOString().slice(0, 10)
                    }));
                    setShowTransferModal(true);
                  }}
                  type="button"
                  style={{ flexShrink: 0 }}
                >
                  移動を記録
                </button>
              </div>

              <div className="card">
                <div className="ledger-csv__head">
                  <p className="eyebrow">CSV</p>
                  {csvMessage ? <span className="ledger-csv__message">{csvMessage}</span> : null}
                </div>
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
                <div className="ledger-csv__actions">
                  <button className="btn btn--out btn--sm" onClick={downloadTemplate} type="button">
                    <span className="material-symbols-outlined">file_download</span>テンプレート
                  </button>
                  <button className="btn btn--out btn--sm" onClick={() => void exportCsv()} type="button">
                    <span className="material-symbols-outlined">download</span>エクスポート
                  </button>
                  <button className="btn btn--out btn--sm" disabled={csvImporting} onClick={() => csvFileRef.current?.click()} type="button">
                    <span className="material-symbols-outlined">upload</span>
                    {csvImporting ? "インポート中..." : "インポート"}
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : null}

        {/* ── Calendar tab ────────────────────────────────── */}
        {tab === "calendar" ? (
          <div style={{ padding: "var(--s4)" }}>
            <div className="card">
              <CalendarHeatmap records={allRecords} periodId={periodId} />
            </div>
          </div>
        ) : null}

        {message ? <div style={{ padding: "0 var(--s4)" }}><Feedback kind="ok">{message}</Feedback></div> : null}
        {error ? <div style={{ padding: "0 var(--s4)" }}><Feedback kind="err">{error}</Feedback></div> : null}
      </div>

      {/* ── 編集モーダル ─────────────────────────── */}
      {editRecord ? (
        <div className="modal-overlay" onClick={() => setEditRecord(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-panel__head">
              <p className="modal-panel__title">記録を編集</p>
              <button className="btn btn--icon btn--sm" onClick={() => setEditRecord(null)} type="button">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="form-stack">
              <div>
                <p className="field__label">種別</p>
                <div className="seg">
                  {(["INCOME", "EXPENSE", "SAVING"] as const).map((t) => (
                    <button
                      key={t}
                      className={`seg__btn ${editForm.type === t ? "on" : ""}`}
                      onClick={() => setEditForm((f) => ({ ...f, type: t, categoryId: "", goalId: "" }))}
                      type="button"
                    >
                      {t === "INCOME" ? "収入" : t === "EXPENSE" ? "支出" : "貯金"}
                    </button>
                  ))}
                </div>
              </div>

              <label className="field">
                <span className="field__label">日付</span>
                <input
                  type="date"
                  value={editForm.recordDate}
                  onChange={(e) => setEditForm((f) => ({ ...f, recordDate: e.target.value }))}
                />
              </label>
              <label className="field">
                <span className="field__label">
                  時刻
                  <span style={{ marginLeft: "6px", fontSize: "10px", color: "var(--text-3)", fontWeight: 400 }}>空白 = 未設定</span>
                </span>
                <input
                  type="time"
                  value={editForm.recordedAt}
                  onChange={(e) => setEditForm((f) => ({ ...f, recordedAt: e.target.value }))}
                />
              </label>

              <label className="field">
                <span className="field__label">金額</span>
                <input
                  type="number"
                  min="1"
                  value={editForm.amount}
                  onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0"
                />
              </label>

              <label className="field">
                <span className="field__label">取引先 / メモ</span>
                <input
                  type="text"
                  value={editForm.memo}
                  onChange={(e) => setEditForm((f) => ({ ...f, memo: e.target.value }))}
                  placeholder="任意"
                />
              </label>

              <label className="field">
                <span className="field__label">口座</span>
                <select
                  value={editForm.accountId}
                  onChange={(e) => setEditForm((f) => ({ ...f, accountId: e.target.value }))}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </label>

              {editForm.type !== "SAVING" ? (
                <label className="field">
                  <span className="field__label">カテゴリ</span>
                  <select
                    value={editForm.categoryId}
                    onChange={(e) => setEditForm((f) => ({ ...f, categoryId: e.target.value }))}
                  >
                    <option value="">未選択</option>
                    {categories.filter((c) => c.type === editForm.type).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
              ) : null}

              {editForm.type === "SAVING" ? (
                <label className="field">
                  <span className="field__label">貯金先</span>
                  <select
                    value={editForm.goalId}
                    onChange={(e) => setEditForm((f) => ({ ...f, goalId: e.target.value }))}
                  >
                    <option value="">未選択</option>
                    {goals.map((g) => (
                      <option key={g.id} value={g.id}>{g.title}</option>
                    ))}
                  </select>
                </label>
              ) : null}

              <div>
                <p className="field__label" style={{ marginBottom: "var(--s2)" }}>感情（任意）</p>
                <div className="chip-group">
                  {EMOTIONS.map((em) => (
                    <button
                      key={em}
                      className={`chip ${editForm.emotions.includes(em) ? "on" : ""}`}
                      onClick={() => setEditForm((f) => ({
                        ...f,
                        emotions: f.emotions.includes(em)
                          ? f.emotions.filter((e) => e !== em)
                          : [...f.emotions, em]
                      }))}
                      type="button"
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "var(--s3)", marginTop: "var(--s4)" }}>
              <button className="btn btn--out" onClick={() => setEditRecord(null)} type="button" style={{ flex: 1 }}>
                キャンセル
              </button>
              <button
                className="btn btn--fill"
                disabled={editSaving || !editForm.amount || !editForm.recordDate || !editForm.accountId}
                onClick={() => void submitEdit()}
                type="button"
                style={{ flex: 1 }}
              >
                {editSaving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── 口座移動記録モーダル ─────────────────── */}
      {showTransferModal ? (
        <div className="modal-overlay" onClick={() => setShowTransferModal(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-panel__head">
              <p className="modal-panel__title">口座移動を記録</p>
              <button className="btn btn--icon btn--sm" onClick={() => setShowTransferModal(false)} type="button">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="form-stack">
              <div>
                <p className="field__label">種別</p>
                <div className="seg">
                  {([
                    { id: "TRANSFER", label: "口座移動" },
                    { id: "SAVING",   label: "貯金積立" },
                    { id: "WITHDRAW", label: "貯金崩す" }
                  ] as const).map((opt) => (
                    <button
                      key={opt.id}
                      className={`seg__btn ${transferKindUi === opt.id ? "on" : ""}`}
                      onClick={() => {
                        setTransferKindUi(opt.id);
                        setTransferForm(f => ({ ...f, kind: opt.id === "WITHDRAW" ? "TRANSFER" : opt.id, goalId: "" }));
                      }}
                      type="button"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {transferKindUi === "WITHDRAW" ? (
                  <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "4px" }}>
                    貯金口座 → 通常口座への移動として記録します
                  </p>
                ) : null}
              </div>

              <label className="field">
                <span className="field__label">日付</span>
                <input type="date" value={transferForm.recordDate}
                  onChange={(e) => setTransferForm(f => ({ ...f, recordDate: e.target.value }))} />
              </label>

              <label className="field">
                <span className="field__label">金額</span>
                <input type="number" min="1" value={transferForm.amount} placeholder="0"
                  onChange={(e) => setTransferForm(f => ({ ...f, amount: e.target.value }))} />
              </label>

              <label className="field">
                <span className="field__label">メモ</span>
                <input type="text" value={transferForm.memo} placeholder="任意"
                  onChange={(e) => setTransferForm(f => ({ ...f, memo: e.target.value }))} />
              </label>

              <div className="form-grid">
                <label className="field">
                  <span className="field__label">{transferKindUi === "WITHDRAW" ? "貯金口座（崩す元）" : "元口座"}</span>
                  <select value={transferForm.fromAccountId}
                    onChange={(e) => setTransferForm(f => ({ ...f, fromAccountId: e.target.value }))}>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">{transferKindUi === "WITHDRAW" ? "受取口座" : transferKindUi === "SAVING" ? "着地口座" : "移動先"}</span>
                  <select value={transferForm.toAccountId}
                    onChange={(e) => setTransferForm(f => ({ ...f, toAccountId: e.target.value }))}>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
              </div>

              {transferKindUi === "SAVING" ? (
                <label className="field">
                  <span className="field__label">目標</span>
                  <select value={transferForm.goalId}
                    onChange={(e) => setTransferForm(f => ({ ...f, goalId: e.target.value }))}>
                    <option value="">選択しない</option>
                    {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
                  </select>
                </label>
              ) : null}
            </div>

            <div style={{ display: "flex", gap: "var(--s3)", marginTop: "var(--s4)" }}>
              <button className="btn btn--out" onClick={() => setShowTransferModal(false)} type="button" style={{ flex: 1 }}>
                キャンセル
              </button>
              <button
                className="btn btn--fill"
                disabled={transferSaving || !transferForm.amount || !transferForm.recordDate || !transferForm.fromAccountId || !transferForm.toAccountId || transferForm.fromAccountId === transferForm.toAccountId}
                onClick={() => void createTransfer()}
                type="button"
                style={{ flex: 1 }}
              >
                {transferSaving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── インポート結果モーダル ─────────────────── */}
      {importResult ? (
        <div className="modal-overlay" onClick={() => setImportResult(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-panel__head">
              <p className="modal-panel__title">インポート結果</p>
              <button className="btn btn--icon btn--sm" onClick={() => setImportResult(null)} type="button">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="import-result-summary">
              <div className="import-result-stat import-result-stat--ok">
                <span className="material-symbols-outlined">check_circle</span>
                <span>{importResult.imported}件 成功</span>
              </div>
              {importResult.failed.length > 0 && (
                <div className="import-result-stat import-result-stat--err">
                  <span className="material-symbols-outlined">cancel</span>
                  <span>{importResult.failed.length}件 失敗</span>
                </div>
              )}
              <div className="import-result-stat">
                <span>合計 {importResult.total}件</span>
              </div>
            </div>

            {importResult.failed.length > 0 && (
              <div className="import-result-failed">
                <p className="import-result-failed__label">失敗した行</p>
                {importResult.failed.map((f, i) => (
                  <div className="import-result-failed__row" key={i}>
                    <span className="import-result-failed__line">{f.line}行目</span>
                    <span className="import-result-failed__reason">{f.reason}</span>
                    {f.raw && <code className="import-result-failed__raw">{f.raw}</code>}
                  </div>
                ))}
              </div>
            )}

            <button className="btn btn--fill" onClick={() => setImportResult(null)} type="button" style={{ width: "100%", marginTop: "var(--s4)" }}>
              閉じる
            </button>
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
