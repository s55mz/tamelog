import { useEffect, useState } from "react";

import { apiRequest } from "../lib/api";
import { getAuthToken } from "../lib/storage";

type Account = {
  id: string;
  name: string;
  type: string;
  balance: number;
  isPrimary: boolean;
};

export function AccountsPage() {
  const token = getAuthToken();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState({ name: "", type: "BANK", balance: "0", isPrimary: false });

  const loadAccounts = async () => {
    if (!token) {
      return;
    }

    const data = await apiRequest<{ accounts: Account[] }>("/api/accounts", { token });
    setAccounts(data.accounts);
  };

  useEffect(() => {
    void loadAccounts();
  }, [token]);

  const createAccount = async () => {
    if (!token) {
      return;
    }

    await apiRequest("/api/accounts", {
      method: "POST",
      token,
      body: {
        name: form.name,
        type: form.type,
        balance: Number(form.balance),
        isPrimary: form.isPrimary
      }
    });

    setForm({ name: "", type: "BANK", balance: "0", isPrimary: false });
    await loadAccounts();
  };

  return (
    <main className="screen-shell">
      <section className="panel panel-wide">
        <span className="eyebrow">Accounts</span>
        <h1>口座管理</h1>
        <div className="status-grid">
          {accounts.map((account) => (
            <article className="status-card" key={account.id}>
              <h2>{account.name}</h2>
              <p>{account.type}</p>
              <p>{account.balance} 円</p>
              <p>{account.isPrimary ? "メイン口座" : "通常口座"}</p>
            </article>
          ))}
        </div>

        <div className="stack">
          <h2 className="section-subtitle">口座を追加</h2>
          <label className="field">
            <span>口座名</span>
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <label className="field">
            <span>種別</span>
            <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
              <option value="BANK">銀行口座</option>
              <option value="CASH">現金</option>
              <option value="CREDIT">クレジットカード</option>
            </select>
          </label>
          <label className="field">
            <span>残高</span>
            <input type="number" value={form.balance} onChange={(event) => setForm({ ...form, balance: event.target.value })} />
          </label>
          <label className="checkbox-row">
            <input checked={form.isPrimary} onChange={(event) => setForm({ ...form, isPrimary: event.target.checked })} type="checkbox" />
            <span>メイン口座にする</span>
          </label>
          <button className="button" onClick={createAccount} type="button">
            追加する
          </button>
        </div>
      </section>
    </main>
  );
}
