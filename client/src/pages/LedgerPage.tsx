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

  return (
    <AppLayout onLogout={onLogout} subtitle="記録と移動をまとめて確認する家計簿です。" title="家計簿" user={user}>
      <section className="dashboard-grid">
        <article className="surface-card compact-surface"><h2>収入</h2><p className="mini-stat">{summary.incomeTotal} 円</p></article>
        <article className="surface-card compact-surface"><h2>支出</h2><p className="mini-stat">{summary.expenseTotal} 円</p></article>
        <article className="surface-card compact-surface"><h2>貯金</h2><p className="mini-stat">{summary.savingTotal} 円</p></article>
      </section>

      <section className="content-section">
        <div className="section-heading-row"><div><p className="section-label">Records</p><h2 className="section-title">記録一覧</h2></div></div>
        <div className="goal-list">
          {records.map((record) => (
            <article className="goal-row-card" key={record.id}>
              <strong>{record.type} {record.amount} 円</strong>
              <p>{record.recordDate} / {record.account.name}</p>
              <p>{record.category?.name ?? record.goal?.title ?? "カテゴリなし"}</p>
              {record.memo && <p>{record.memo}</p>}
            </article>
          ))}
          {records.length === 0 && <article className="empty-card">まだ記録がありません。</article>}
        </div>
      </section>

      <section className="content-section">
        <div className="section-heading-row"><div><p className="section-label">Transfers</p><h2 className="section-title">口座移動</h2></div></div>
        <div className="goal-list">
          {transfers.map((transfer) => (
            <article className="goal-row-card" key={transfer.id}>
              <strong>{transfer.amount} 円</strong>
              <p>{transfer.recordDate} / {transfer.fromAccount.name} → {transfer.toAccount.name}</p>
              {transfer.memo && <p>{transfer.memo}</p>}
            </article>
          ))}
          {transfers.length === 0 && <article className="empty-card">まだ口座移動がありません。</article>}
        </div>
      </section>
    </AppLayout>
  );
}
