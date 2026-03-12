import { useEffect, useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { apiRequest } from "../lib/api";
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
  amount: number;
  memo: string | null;
  recordDate: string;
  fromAccount: { id: string; name: string };
  toAccount: { id: string; name: string };
};

type LedgerPageProps = {
  user: AppUser;
  onLogout: () => Promise<void>;
};

export function LedgerPage({ user, onLogout }: LedgerPageProps) {
  const token = getAuthToken();
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [summary, setSummary] = useState({ incomeTotal: 0, expenseTotal: 0, savingTotal: 0 });

  useEffect(() => {
    if (!token) {
      return;
    }

    void Promise.all([
      apiRequest<{ records: RecordItem[]; summary: typeof summary }>("/api/records", { token }),
      apiRequest<{ transfers: TransferItem[] }>("/api/account-transfers", { token })
    ]).then(([recordsData, transfersData]) => {
      setRecords(recordsData.records);
      setSummary(recordsData.summary);
      setTransfers(transfersData.transfers);
    });
  }, [token]);

  const rows = [
    ...records.map((record) => ({
      id: `record-${record.id}`,
      recordDate: record.recordDate,
      type: record.type,
      accountName: record.account.name,
      categoryName: record.category?.name ?? record.goal?.title ?? "-",
      memo: record.memo ?? "",
      amountText: `${record.type === "EXPENSE" ? "-" : "+"}¥${record.amount}`
    })),
    ...transfers.flatMap((transfer) => ([
      {
        id: `transfer-from-${transfer.id}`,
        recordDate: transfer.recordDate,
        type: "MOVE-OUT",
        accountName: transfer.fromAccount.name,
        categoryName: "移動元",
        memo: transfer.memo ?? "",
        amountText: `-¥${transfer.amount}`
      },
      {
        id: `transfer-to-${transfer.id}`,
        recordDate: transfer.recordDate,
        type: "MOVE-IN",
        accountName: transfer.toAccount.name,
        categoryName: "移動先",
        memo: transfer.memo ?? "",
        amountText: `+¥${transfer.amount}`
      }
    ]))
  ].sort((left, right) => right.recordDate.localeCompare(left.recordDate));

  return (
    <AppLayout onLogout={onLogout} subtitle="収入・支出・貯金・移動を 1 つの一覧で確認する家計簿です。" title="家計簿" user={user}>
      <section className="dashboard-grid">
        <article className="surface-card compact-surface"><p className="section-label">Income</p><h2>収入合計</h2><p className="mini-stat">{summary.incomeTotal} 円</p></article>
        <article className="surface-card compact-surface"><p className="section-label">Expense</p><h2>支出合計</h2><p className="mini-stat">{summary.expenseTotal} 円</p></article>
        <article className="surface-card compact-surface"><p className="section-label">Saving</p><h2>貯金合計</h2><p className="mini-stat">{summary.savingTotal} 円</p></article>
      </section>

      <section className="content-section">
        <div className="section-heading-row"><div><p className="section-label">Ledger</p><h2 className="section-title">統合一覧</h2></div></div>
        <div className="goal-list">
          {rows.map((row) => (
            <article className="goal-row-card" key={row.id}>
              <div className="goal-row-copy">
                <strong>{row.recordDate} / {row.type}</strong>
                <p>{row.accountName}</p>
                <p className="muted-copy">{row.categoryName}{row.memo ? ` / ${row.memo}` : ""}</p>
              </div>
              <div className="goal-row-side">
                <span className="goal-pill">{row.amountText}</span>
              </div>
            </article>
          ))}
          {rows.length === 0 && <article className="empty-card">まだ記録がありません。</article>}
        </div>
      </section>
    </AppLayout>
  );
}
