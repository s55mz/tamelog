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
  const keypadValues = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "del"];

  const appendAmount = (value: string) => {
    if (value === "del") {
      setForm((current) => ({
        ...current,
        amount: current.amount.slice(0, -1)
      }));
      return;
    }

    setForm((current) => ({
      ...current,
      amount: `${current.amount}${value}`.replace(/^0+(?=\d)/, "")
    }));
  };

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
    <AppLayout onLogout={onLogout} subtitle="入力の負荷を減らして、今日の支出や貯金をすぐ残せる記録画面です。" title="記録" user={user}>
      <section className="shellHero">
        <article className="surface-card feature-goal-card">
          <p className="section-label">Quick Entry</p>
          <h2>{mode === "record" ? "1 件だけ、静かに残す" : "口座の移動を整える"}</h2>
          <p className="muted-copy">
            {mode === "record"
              ? "記録は短く、判断はあとから。まず金額と行き先だけ入れれば十分です。"
              : "振替は残高の見え方を整えるための操作です。移動元と移動先だけ間違えなければ大丈夫です。"}
          </p>
          <div className="numberDisplay">¥{form.amount || "0"}</div>
          <div className="pillRow">
            <span className="softPill">{mode === "record" ? "収支・貯金" : "口座移動"}</span>
            <span className="softPill">{form.recordDate}</span>
            {mode === "record" && <span className="softPill">{form.type}</span>}
          </div>
        </article>

        <article className="surface-card form-card">
        <div className="segmented-control">
          <button className={`button ${mode === "record" ? "" : "button-secondary"}`} onClick={() => setMode("record")} type="button">
            収支・貯金
          </button>
          <button className={`button ${mode === "transfer" ? "" : "button-secondary"}`} onClick={() => setMode("transfer")} type="button">
            口座移動
          </button>
        </div>
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
                <div className="field">
                  <span>カテゴリ</span>
                  <div className="pillRow">
                    <button className={`ghostButton ${form.categoryId === "" ? "button-secondary" : ""}`} onClick={() => setForm({ ...form, categoryId: "" })} type="button">
                      未選択
                    </button>
                    {filteredCategories.map((category) => (
                      <button
                        className={`ghostButton ${form.categoryId === category.id ? "button-secondary" : ""}`}
                        key={category.id}
                        onClick={() => setForm({ ...form, categoryId: category.id })}
                        type="button"
                      >
                        {category.name}
                      </button>
                    ))}
                  </div>
                </div>
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
          <div className="status-grid">
            {keypadValues.map((value) => (
              <button className="ghostButton wideButton" key={value} onClick={() => appendAmount(value)} type="button">
                {value === "del" ? "del" : value}
              </button>
            ))}
          </div>
          </div>
        </article>

        {message && <p className="success-text">{message}</p>}
        {error && <p className="error-text">{error}</p>}
      </section>
    </AppLayout>
  );
}
