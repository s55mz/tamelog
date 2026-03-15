import { useEffect, useMemo, useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { EmptyState, Feedback } from "../components/ui";
import { apiRequest } from "../lib/api";
import { formatCurrency, formatDate } from "../lib/format";
import { getAuthToken } from "../lib/storage";
import type { AppUser } from "../lib/types";

type Account = { id: string; name: string; type: string; balance: number; isPrimary: boolean };

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

const accountTypeLabel: Record<string, string> = {
  BANK: "銀行口座",
  CASH: "現金",
  CREDIT: "クレジットカード"
};

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
  const [showAccountForm, setShowAccountForm] = useState(false);

  const loadData = async () => {
    if (!token) return;
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

  useEffect(() => { void loadData(); }, [token]);

  const saveAccount = async () => {
    if (!token) return;
    setMessage(""); setError("");
    try {
      if (accountForm.id) {
        await apiRequest(`/api/accounts/${accountForm.id}`, {
          method: "PUT", token,
          body: { name: accountForm.name, type: accountForm.type, balance: Number(accountForm.balance), isPrimary: accountForm.isPrimary }
        });
      } else {
        await apiRequest("/api/accounts", {
          method: "POST", token,
          body: { name: accountForm.name, type: accountForm.type, balance: Number(accountForm.balance), isPrimary: accountForm.isPrimary }
        });
      }
      setAccountForm(initialAccountForm);
      setShowAccountForm(false);
      setMessage("口座を更新しました。");
      await loadData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "口座の保存に失敗しました");
    }
  };

  const deleteAccount = async (accountId: string) => {
    if (!token) return;
    setMessage(""); setError("");
    try {
      await apiRequest(`/api/accounts/${accountId}`, { method: "DELETE", token });
      setMessage("口座を削除しました。");
      await loadData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "口座の削除に失敗しました");
    }
  };

  const createTransfer = async () => {
    if (!token) return;
    setMessage(""); setError("");
    try {
      await apiRequest("/api/account-transfers", {
        method: "POST", token,
        body: {
          fromAccountId: transferForm.fromAccountId,
          toAccountId: transferForm.toAccountId,
          amount: Number(transferForm.amount),
          memo: transferForm.memo || null,
          recordDate: transferForm.recordDate
        }
      });
      setTransferForm((current) => ({ ...current, amount: "", memo: "" }));
      setMessage("口座移動を保存しました。");
      await loadData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "口座移動の保存に失敗しました");
    }
  };

  const mainAccount = useMemo(
    () => accounts.find((a) => a.isPrimary) ?? accounts[0] ?? null,
    [accounts]
  );

  return (
    <AppLayout
      onLogout={onLogout}
      subtitle="口座残高と移動履歴を整理して、残高のズレを防ぎます。"
      title="口座"
      user={user}
    >
      {/* ── Total balance ──────────────────────────────── */}
      <div className="card">
        <p className="eyebrow">総残高</p>
        <p className="stat__value stat__value--xl">{formatCurrency(totalBalance)}</p>
        <div className="row row--wrap">
          <span className="text-sm">口座数 {accounts.length}</span>
          {mainAccount ? (
            <>
              <span className="text-xs">·</span>
              <span className="text-sm">メイン: {mainAccount.name}</span>
            </>
          ) : null}
        </div>
      </div>

      {/* ── Account list ───────────────────────────────── */}
      <div>
        <div className="row row--spread">
          <p className="eyebrow">口座一覧</p>
          <button
            className="btn btn--fill btn--sm"
            onClick={() => { setAccountForm(initialAccountForm); setShowAccountForm(true); }}
            type="button"
          >
            <span className="material-symbols-outlined">add</span>
            追加
          </button>
        </div>

        {accounts.length ? (
          <div className="auto-grid">
            {accounts.map((account) => (
              <div className="card" key={account.id}>
                <p className="account-card__type">
                  {accountTypeLabel[account.type] ?? account.type}
                  {account.isPrimary ? " · メイン" : ""}
                </p>
                <p className="account-card__name">{account.name}</p>
                <p className="account-card__balance">{formatCurrency(account.balance)}</p>
                <div className="btn-row">
                  <button
                    className="btn btn--out btn--sm"
                    onClick={() => {
                      setAccountForm({
                        id: account.id, name: account.name, type: account.type,
                        balance: String(account.balance), isPrimary: account.isPrimary
                      });
                      setShowAccountForm(true);
                    }}
                    type="button"
                  >
                    編集
                  </button>
                  <button className="btn btn--del btn--sm" onClick={() => void deleteAccount(account.id)} type="button">
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>口座がまだありません。</EmptyState>
        )}
      </div>

      {/* ── Account form ───────────────────────────────── */}
      {showAccountForm ? (
        <div className="card form-stack">
          <p className="eyebrow">{accountForm.id ? "口座を編集" : "口座を追加"}</p>
          <div className="form-grid">
            <label className="field">
              <span className="field__label">口座名</span>
              <input value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} />
            </label>
            <label className="field">
              <span className="field__label">種別</span>
              <select value={accountForm.type} onChange={(e) => setAccountForm({ ...accountForm, type: e.target.value })}>
                <option value="BANK">銀行口座</option>
                <option value="CASH">現金</option>
                <option value="CREDIT">クレジットカード</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">残高</span>
              <input type="number" value={accountForm.balance} onChange={(e) => setAccountForm({ ...accountForm, balance: e.target.value })} />
            </label>
            <label className="toggle-row">
              <input checked={accountForm.isPrimary} onChange={(e) => setAccountForm({ ...accountForm, isPrimary: e.target.checked })} type="checkbox" />
              メイン口座にする
            </label>
          </div>
          <div className="btn-row">
            <button className="btn btn--fill" onClick={() => void saveAccount()} type="button">
              {accountForm.id ? "更新する" : "追加する"}
            </button>
            <button className="btn btn--out" onClick={() => { setAccountForm(initialAccountForm); setShowAccountForm(false); }} type="button">
              キャンセル
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Transfer form ──────────────────────────────── */}
      <div>
        <p className="eyebrow">口座間移動</p>
        <div className="card form-stack">
          <div className="form-grid">
            <label className="field">
              <span className="field__label">移動元</span>
              <select value={transferForm.fromAccountId} onChange={(e) => setTransferForm({ ...transferForm, fromAccountId: e.target.value })}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field__label">移動先</span>
              <select value={transferForm.toAccountId} onChange={(e) => setTransferForm({ ...transferForm, toAccountId: e.target.value })}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field__label">金額</span>
              <input type="number" value={transferForm.amount} onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })} />
            </label>
            <label className="field">
              <span className="field__label">日付</span>
              <input type="date" value={transferForm.recordDate} onChange={(e) => setTransferForm({ ...transferForm, recordDate: e.target.value })} />
            </label>
            <label className="field field--wide">
              <span className="field__label">メモ</span>
              <input value={transferForm.memo} onChange={(e) => setTransferForm({ ...transferForm, memo: e.target.value })} placeholder="任意" />
            </label>
          </div>
          <button className="btn btn--fill" onClick={() => void createTransfer()} type="button">
            移動を保存
          </button>
        </div>
      </div>

      {/* ── Transfer history ───────────────────────────── */}
      {transfers.length > 0 ? (
        <div>
          <p className="eyebrow">移動履歴</p>
          <div className="entry-list">
            {transfers.map((t) => (
              <div className="entry" key={t.id}>
                <span className="badge badge--move">移動</span>
                <div className="entry__body">
                  <p className="entry__title">{t.fromAccount.name} → {t.toAccount.name}</p>
                  {t.memo ? <p className="entry__sub">{t.memo}</p> : null}
                </div>
                <div>
                  <p className="entry__amount">{formatCurrency(t.amount)}</p>
                  <p className="entry__meta">{formatDate(t.recordDate)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {message ? <Feedback kind="ok">{message}</Feedback> : null}
      {error ? <Feedback kind="err">{error}</Feedback> : null}
    </AppLayout>
  );
}
