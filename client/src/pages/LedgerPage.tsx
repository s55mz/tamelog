import { useEffect, useState } from "react";

import { apiRequest } from "../lib/api";
import { getAuthToken } from "../lib/storage";

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

export function LedgerPage() {
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
    <main className="screen-shell">
      <section className="panel panel-wide">
        <span className="eyebrow">Ledger</span>
        <h1>家計簿</h1>
        <div className="status-grid">
          <article className="status-card"><h2>収入</h2><p>{summary.incomeTotal} 円</p></article>
          <article className="status-card"><h2>支出</h2><p>{summary.expenseTotal} 円</p></article>
          <article className="status-card"><h2>貯金</h2><p>{summary.savingTotal} 円</p></article>
        </div>

        <div className="stack">
          <h2 className="section-subtitle">記録一覧</h2>
          {records.map((record) => (
            <article className="subpanel" key={record.id}>
              <strong>{record.type} {record.amount} 円</strong>
              <p>{record.recordDate} / {record.account.name}</p>
              <p>{record.category?.name ?? record.goal?.title ?? "カテゴリなし"}</p>
              {record.memo && <p>{record.memo}</p>}
            </article>
          ))}
          {records.length === 0 && <p>まだ記録がありません。</p>}
        </div>

        <div className="stack">
          <h2 className="section-subtitle">口座移動</h2>
          {transfers.map((transfer) => (
            <article className="subpanel" key={transfer.id}>
              <strong>{transfer.amount} 円</strong>
              <p>{transfer.recordDate} / {transfer.fromAccount.name} → {transfer.toAccount.name}</p>
              {transfer.memo && <p>{transfer.memo}</p>}
            </article>
          ))}
          {transfers.length === 0 && <p>まだ口座移動がありません。</p>}
        </div>
      </section>
    </main>
  );
}
