import { useEffect, useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { apiRequest } from "../lib/api";
import { getAuthToken } from "../lib/storage";
import type { AppUser } from "../lib/types";

type Account = {
  id: string;
  name: string;
  type: string;
  balance: number;
  isPrimary: boolean;
};

type TransferItem = {
  id: string;
  amount: number;
  memo: string | null;
  recordDate: string;
  fromAccount: { id: string; name: string };
  toAccount: { id: string; name: string };
};

type AccountsPageProps = {
  user: AppUser;
  onLogout: () => Promise<void>;
};

const initialAccountForm = { id: "", name: "", type: "BANK", balance: "0", isPrimary: false };

export function AccountsPage({ user, onLogout }: AccountsPageProps) {
  const token = getAuthToken();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [accountForm, setAccountForm] = useState(initialAccountForm);
  const [transferForm, setTransferForm] = useState({
    fromAccountId: "",
    toAccountId: "",
    amount: "",
    memo: "",
    recordDate: new Date().toISOString().slice(0, 10)
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadData = async () => {
    if (!token) {
      return;
    }

    const [accountsData, transfersData] = await Promise.all([
      apiRequest<{ accounts: Account[]; totalBalance: number }>("/api/accounts", { token }),
      apiRequest<{ transfers: TransferItem[] }>("/api/account-transfers", { token })
    ]);
    setAccounts(accountsData.accounts);
    setTotalBalance(accountsData.totalBalance);
    setTransfers(transfersData.transfers);
    setTransferForm((current) => ({
      ...current,
      fromAccountId: current.fromAccountId || accountsData.accounts[0]?.id || "",
      toAccountId: current.toAccountId || accountsData.accounts[1]?.id || accountsData.accounts[0]?.id || ""
    }));
  };

  useEffect(() => {
    void loadData();
  }, [token]);

  const saveAccount = async () => {
    if (!token) {
      return;
    }

    setMessage("");
    setError("");

    try {
      if (accountForm.id) {
        await apiRequest(`/api/accounts/${accountForm.id}`, {
          method: "PUT",
          token,
          body: {
            name: accountForm.name,
            type: accountForm.type,
            balance: Number(accountForm.balance),
            isPrimary: accountForm.isPrimary
          }
        });
      } else {
        await apiRequest("/api/accounts", {
          method: "POST",
          token,
          body: {
            name: accountForm.name,
            type: accountForm.type,
            balance: Number(accountForm.balance),
            isPrimary: accountForm.isPrimary
          }
        });
      }

      setAccountForm(initialAccountForm);
      setMessage("口座を更新しました。");
      await loadData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "口座の保存に失敗しました");
    }
  };

  const deleteAccount = async (accountId: string) => {
    if (!token) {
      return;
    }

    setMessage("");
    setError("");

    try {
      await apiRequest(`/api/accounts/${accountId}`, {
        method: "DELETE",
        token
      });
      setMessage("口座を削除しました。");
      await loadData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "口座の削除に失敗しました");
    }
  };

  const createTransfer = async () => {
    if (!token) {
      return;
    }

    setMessage("");
    setError("");

    try {
      await apiRequest("/api/account-transfers", {
        method: "POST",
        token,
        body: {
          fromAccountId: transferForm.fromAccountId,
          toAccountId: transferForm.toAccountId,
          amount: Number(transferForm.amount),
          memo: transferForm.memo || null,
          recordDate: transferForm.recordDate
        }
      });

      setTransferForm((current) => ({
        ...current,
        amount: "",
        memo: ""
      }));
      setMessage("口座移動を保存しました。");
      await loadData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "口座移動の保存に失敗しました");
    }
  };

  return (
    <AppLayout onLogout={onLogout} subtitle="総残高、口座カード、編集、削除、口座間移動までまとめた口座管理画面です。" title="口座管理" user={user}>
      <section className="shellHero">
        <article className="surface-card feature-goal-card">
          <p className="section-label">Total Balance</p>
          <h2>全口座の残高</h2>
          <div className="numberDisplay">¥{totalBalance}</div>
          <div className="pillRow">
            <span className="softPill">口座数 {accounts.length}</span>
            <span className="softPill">メイン口座 {accounts.find((account) => account.isPrimary)?.name ?? "-"}</span>
          </div>
        </article>

        <article className="surface-card form-card">
          <p className="section-label">{accountForm.id ? "Edit Account" : "New Account"}</p>
          <h2 className="section-title">口座を追加 / 編集</h2>
          <div className="stack compact">
            <label className="field">
              <span>口座名</span>
              <input value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} />
            </label>
            <label className="field">
              <span>種別</span>
              <select value={accountForm.type} onChange={(event) => setAccountForm({ ...accountForm, type: event.target.value })}>
                <option value="BANK">銀行口座</option>
                <option value="CASH">現金</option>
                <option value="CREDIT">クレジットカード</option>
              </select>
            </label>
            <label className="field">
              <span>残高</span>
              <input type="number" value={accountForm.balance} onChange={(event) => setAccountForm({ ...accountForm, balance: event.target.value })} />
            </label>
            <label className="checkbox-row">
              <input checked={accountForm.isPrimary} onChange={(event) => setAccountForm({ ...accountForm, isPrimary: event.target.checked })} type="checkbox" />
              <span>メイン口座にする</span>
            </label>
            <div className="button-row">
              <button className="button" onClick={() => void saveAccount()} type="button">
                {accountForm.id ? "更新する" : "追加する"}
              </button>
              {accountForm.id && (
                <button className="ghostButton" onClick={() => setAccountForm(initialAccountForm)} type="button">
                  キャンセル
                </button>
              )}
            </div>
          </div>
        </article>
      </section>

      <section className="content-section">
        <div className="section-heading-row">
          <div>
            <p className="section-label">Accounts</p>
            <h2 className="section-title">口座一覧</h2>
          </div>
        </div>
        <div className="status-grid">
          {accounts.map((account) => (
            <article className="surface-card compact-surface" key={account.id}>
              <p className="section-label">{account.type}</p>
              <h2>{account.name}</h2>
              <p className="mini-stat">{account.balance} 円</p>
              <div className="pillRow">
                <span className="softPill">{account.isPrimary ? "メイン口座" : "通常口座"}</span>
                {account.balance < 0 && <span className="softPill">残高マイナス</span>}
              </div>
              <div className="button-row">
                <button className="ghostButton" onClick={() => setAccountForm({ id: account.id, name: account.name, type: account.type, balance: String(account.balance), isPrimary: account.isPrimary })} type="button">
                  編集
                </button>
                <button className="ghostButton danger-button" onClick={() => void deleteAccount(account.id)} type="button">
                  削除
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="surface-card form-card">
          <p className="section-label">Transfer</p>
          <h2 className="section-title">口座間移動</h2>
          <div className="stack compact">
            <label className="field">
              <span>移動元</span>
              <select value={transferForm.fromAccountId} onChange={(event) => setTransferForm({ ...transferForm, fromAccountId: event.target.value })}>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>移動先</span>
              <select value={transferForm.toAccountId} onChange={(event) => setTransferForm({ ...transferForm, toAccountId: event.target.value })}>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>金額</span>
              <input type="number" value={transferForm.amount} onChange={(event) => setTransferForm({ ...transferForm, amount: event.target.value })} />
            </label>
            <label className="field">
              <span>日付</span>
              <input type="date" value={transferForm.recordDate} onChange={(event) => setTransferForm({ ...transferForm, recordDate: event.target.value })} />
            </label>
            <label className="field">
              <span>メモ</span>
              <input value={transferForm.memo} onChange={(event) => setTransferForm({ ...transferForm, memo: event.target.value })} />
            </label>
            <button className="button" onClick={() => void createTransfer()} type="button">
              移動を保存
            </button>
          </div>
        </article>

        <article className="surface-card">
          <p className="section-label">Transfer History</p>
          <h2 className="section-title">移動履歴</h2>
          <div className="goal-list">
            {transfers.map((transfer) => (
              <article className="goal-row-card" key={transfer.id}>
                <div className="goal-row-copy">
                  <strong>{transfer.recordDate}</strong>
                  <p>{transfer.fromAccount.name} → {transfer.toAccount.name}</p>
                  {transfer.memo && <p className="muted-copy">{transfer.memo}</p>}
                </div>
                <div className="goal-row-side">
                  <span className="goal-pill">{transfer.amount} 円</span>
                </div>
              </article>
            ))}
            {transfers.length === 0 && <article className="empty-card">移動履歴はまだありません。</article>}
          </div>
        </article>
      </section>

      {(message || error) && (
        <section className="content-section">
          {message && <p className="success-text">{message}</p>}
          {error && <p className="error-text">{error}</p>}
        </section>
      )}
    </AppLayout>
  );
}
