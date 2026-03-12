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
};

type Category = {
  id: string;
  name: string;
  type: string;
};

type Goal = {
  id: string;
  title: string;
};

type RecordPageProps = {
  user: AppUser;
  onLogout: () => Promise<void>;
};

export function RecordPage({ user, onLogout }: RecordPageProps) {
  const token = getAuthToken();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [mode, setMode] = useState<"record" | "transfer">("record");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    type: "EXPENSE",
    accountId: "",
    categoryId: "",
    goalId: "",
    amount: "",
    memo: "",
    recordDate: new Date().toISOString().slice(0, 10),
    fromAccountId: "",
    toAccountId: ""
  });

  useEffect(() => {
    if (!token) {
      return;
    }

    void Promise.all([
      apiRequest<{ accounts: Account[] }>("/api/accounts", { token }),
      apiRequest<{ categories: Category[] }>("/api/categories", { token }),
      apiRequest<{ goals: Goal[] }>("/api/goals", { token })
    ]).then(([accountsData, categoriesData, goalsData]) => {
      setAccounts(accountsData.accounts);
      setCategories(categoriesData.categories);
      setGoals(goalsData.goals);
      setForm((current) => ({
        ...current,
        accountId: current.accountId || accountsData.accounts[0]?.id || "",
        fromAccountId: current.fromAccountId || accountsData.accounts[0]?.id || "",
        toAccountId: current.toAccountId || accountsData.accounts[1]?.id || accountsData.accounts[0]?.id || ""
      }));
    });
  }, [token]);

  const filteredCategories = categories.filter((category) => category.type === form.type);

  const submitRecord = async () => {
    if (!token) {
      return;
    }

    setMessage("");
    setError("");

    try {
      if (mode === "record") {
        await apiRequest("/api/records", {
          method: "POST",
          token,
          body: {
            type: form.type,
            accountId: form.accountId,
            categoryId: form.categoryId || null,
            goalId: form.type === "SAVING" ? form.goalId || null : null,
            amount: Number(form.amount),
            memo: form.memo || null,
            recordDate: form.recordDate
          }
        });
      } else {
        await apiRequest("/api/account-transfers", {
          method: "POST",
          token,
          body: {
            fromAccountId: form.fromAccountId,
            toAccountId: form.toAccountId,
            amount: Number(form.amount),
            memo: form.memo || null,
            recordDate: form.recordDate
          }
        });
      }

      setMessage(mode === "record" ? "記録を保存しました。" : "口座移動を保存しました。");
      setForm((current) => ({
        ...current,
        amount: "",
        memo: "",
        goalId: "",
        categoryId: ""
      }));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "保存に失敗しました");
    }
  };

  return (
    <AppLayout onLogout={onLogout} subtitle="最短操作で 1 件の記録を完了するための画面です。" title="記録" user={user}>
      <section className="content-section">
        <div className="segmented-control">
          <button className={`button ${mode === "record" ? "" : "button-secondary"}`} onClick={() => setMode("record")} type="button">
            収支・貯金
          </button>
          <button className={`button ${mode === "transfer" ? "" : "button-secondary"}`} onClick={() => setMode("transfer")} type="button">
            口座移動
          </button>
        </div>

        <article className="surface-card form-card">
          <div className="stack compact">
          {mode === "record" ? (
            <>
              <label className="field">
                <span>種別</span>
                <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value, categoryId: "", goalId: "" })}>
                  <option value="INCOME">収入</option>
                  <option value="EXPENSE">支出</option>
                  <option value="SAVING">貯金</option>
                </select>
              </label>
              <label className="field">
                <span>口座</span>
                <select value={form.accountId} onChange={(event) => setForm({ ...form, accountId: event.target.value })}>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              {form.type !== "SAVING" && (
                <label className="field">
                  <span>カテゴリ</span>
                  <select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}>
                    <option value="">選択しない</option>
                    {filteredCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {form.type === "SAVING" && (
                <label className="field">
                  <span>目標</span>
                  <select value={form.goalId} onChange={(event) => setForm({ ...form, goalId: event.target.value })}>
                    <option value="">選択しない</option>
                    {goals.map((goal) => (
                      <option key={goal.id} value={goal.id}>
                        {goal.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          ) : (
            <>
              <label className="field">
                <span>移動元</span>
                <select value={form.fromAccountId} onChange={(event) => setForm({ ...form, fromAccountId: event.target.value })}>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>移動先</span>
                <select value={form.toAccountId} onChange={(event) => setForm({ ...form, toAccountId: event.target.value })}>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          <label className="field">
            <span>金額</span>
            <input type="number" min="1" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
          </label>
          <label className="field">
            <span>日付</span>
            <input type="date" value={form.recordDate} onChange={(event) => setForm({ ...form, recordDate: event.target.value })} />
          </label>
          <label className="field">
            <span>メモ</span>
            <input value={form.memo} onChange={(event) => setForm({ ...form, memo: event.target.value })} />
          </label>
          <button className="button" onClick={submitRecord} type="button">
            保存する
          </button>
          </div>
        </article>

        {message && <p className="success-text">{message}</p>}
        {error && <p className="error-text">{error}</p>}
      </section>
    </AppLayout>
  );
}
