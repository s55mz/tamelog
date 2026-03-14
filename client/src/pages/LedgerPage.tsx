import { useEffect, useMemo, useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { EmptyState, Feedback } from "../components/ui";
import { apiRequest } from "../lib/api";
import { formatCurrency, formatDate } from "../lib/format";
import { getAuthToken } from "../lib/storage";
import type { AppUser } from "../lib/types";

type RecordItem = {
  id: string;
  type: string;
  amount: number;
  memo: string | null;
  recordDate: string;
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

export function LedgerPage({ user, onLogout }: LedgerPageProps) {
  const token = getAuthToken();
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [summary, setSummary] = useState({ incomeTotal: 0, expenseTotal: 0, savingTotal: 0 });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadData = async () => {
    if (!token) return;
    const [recordsData, transfersData] = await Promise.all([
      apiRequest<{ records: RecordItem[]; summary: typeof summary }>("/api/records", { token }),
      apiRequest<{ transfers: TransferItem[] }>("/api/account-transfers", { token })
    ]);
    setRecords(recordsData.records);
    setSummary(recordsData.summary);
    setTransfers(transfersData.transfers);
  };

  useEffect(() => { void loadData(); }, [token]);

  const deleteRow = async (row: LedgerRow) => {
    if (!token) return;
    setMessage("");
    setError("");
    try {
      await apiRequest(
        row.kind === "record" ? `/api/records/${row.sourceId}` : `/api/account-transfers/${row.sourceId}`,
        { method: "DELETE", token }
      );
      setMessage("削除しました。");
      await loadData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "削除に失敗しました");
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
          amount: record.type === "EXPENSE" ? -record.amount : record.amount
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

  return (
    <AppLayout onLogout={onLogout} title="家計簿" user={user}>
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

      {/* ── Timeline ───────────────────────────────────── */}
      <div>
        <p className="eyebrow" style={{ marginBottom: "var(--s3)" }}>統合タイムライン</p>
        {rows.length ? (
          <div className="entry-list">
            {rows.map((row) => (
              <div className="entry" key={row.id} style={{ flexWrap: "wrap", gap: "var(--s2)" }}>
                <span className={badgeClass[row.type] ?? "badge"}>
                  {typeDisplay[row.type] ?? row.type}
                </span>
                <div className="entry__body" style={{ minWidth: "120px" }}>
                  <p className="entry__title">{row.accountName}</p>
                  <p className="entry__sub">{row.categoryName}{row.memo ? ` · ${row.memo}` : ""}</p>
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
          <EmptyState>まだ記録がありません。</EmptyState>
        )}
      </div>

      {message ? <Feedback kind="ok">{message}</Feedback> : null}
      {error ? <Feedback kind="err">{error}</Feedback> : null}
    </AppLayout>
  );
}
