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

type RecordMode = "INCOME" | "EXPENSE" | "SAVING" | "TRANSFER";

type RecordPageProps = {
  user: AppUser;
  onLogout: () => Promise<void>;
};

export function RecordPage({ user, onLogout }: RecordPageProps) {
  const token = getAuthToken();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [mode, setMode] = useState<RecordMode>("EXPENSE");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    accountId: "",
    categoryId: "",
    amount: "",
    memo: "",
    recordDate: new Date().toISOString().slice(0, 10),
    fromAccountId: "",
    toAccountId: "",
    goalId: ""
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

  const filteredCategories = categories.filter((category) => category.type === mode);

  const resetInputFields = () => {
    setForm((current) => ({
      ...current,
      amount: "",
      memo: "",
      categoryId: "",
      goalId: ""
    }));
  };

  const submitRecord = async () => {
    if (!token) {
      return;
    }

    setMessage("");
    setError("");

    try {
      if (mode === "INCOME" || mode === "EXPENSE") {
        await apiRequest("/api/records", {
          method: "POST",
          token,
          body: {
            type: mode,
            accountId: form.accountId,
            categoryId: form.categoryId || null,
            goalId: null,
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
            goalId: mode === "SAVING" ? form.goalId || null : null,
            kind: mode === "SAVING" ? "SAVING" : "TRANSFER",
            amount: Number(form.amount),
            memo: form.memo || null,
            recordDate: form.recordDate
          }
        });
      }

      setMessage(mode === "TRANSFER" ? "口座移動を保存しました。" : "記録を保存しました。");
      resetInputFields();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "保存に失敗しました");
    }
  };

  return (
    <AppLayout onLogout={onLogout} subtitle="口座がどう増減したかを残すための記録画面です。貯金も移動として記録します。" title="記録" user={user}>
      <section className="shellHero">
        <article className="surface-card feature-goal-card">
          <p className="section-label">Ledger Based</p>
          <h2>
            {mode === "INCOME" && "入った口座を記録する"}
            {mode === "EXPENSE" && "減った口座を記録する"}
            {mode === "SAVING" && "生活口座から貯金口座へ移す"}
            {mode === "TRANSFER" && "口座間でお金を動かす"}
          </h2>
          <p className="muted-copy">
            {mode === "SAVING"
              ? "貯金は元口座が減り、貯金先口座が増える記録として保存されます。"
              : "どの口座がどう変化したかを後から追えるように、口座単位で記録を残します。"}
          </p>
          <div className="numberDisplay">¥{form.amount || "0"}</div>
          <div className="pillRow">
            <span className="softPill">{mode}</span>
            <span className="softPill">{form.recordDate}</span>
          </div>
        </article>

        <article className="surface-card form-card">
          <div className="segmented-control">
            {(["INCOME", "EXPENSE", "SAVING", "TRANSFER"] as RecordMode[]).map((item) => (
              <button className={`button ${mode === item ? "" : "button-secondary"}`} key={item} onClick={() => setMode(item)} type="button">
                {{ INCOME: "収入", EXPENSE: "支出", SAVING: "貯金", TRANSFER: "移動" }[item]}
              </button>
            ))}
          </div>

          <div className="stack compact">
            {(mode === "INCOME" || mode === "EXPENSE") && (
              <>
                <label className="field">
                  <span>口座</span>
                  <select value={form.accountId} onChange={(event) => setForm({ ...form, accountId: event.target.value })}>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </label>
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
              </>
            )}

            {(mode === "SAVING" || mode === "TRANSFER") && (
              <>
                <label className="field">
                  <span>{mode === "SAVING" ? "元の口座" : "移動元"}</span>
                  <select value={form.fromAccountId} onChange={(event) => setForm({ ...form, fromAccountId: event.target.value })}>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>{mode === "SAVING" ? "貯金先口座" : "移動先"}</span>
                  <select value={form.toAccountId} onChange={(event) => setForm({ ...form, toAccountId: event.target.value })}>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </label>
                {mode === "SAVING" && (
                  <label className="field">
                    <span>目標</span>
                    <select value={form.goalId} onChange={(event) => setForm({ ...form, goalId: event.target.value })}>
                      <option value="">選択しない</option>
                      {goals.map((goal) => (
                        <option key={goal.id} value={goal.id}>{goal.title}</option>
                      ))}
                    </select>
                  </label>
                )}
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
            <div className="status-grid">
              {keypadValues.map((value) => (
                <button className="ghostButton wideButton" key={value} onClick={() => appendAmount(value)} type="button">
                  {value}
                </button>
              ))}
            </div>
            <button className="button" onClick={() => void submitRecord()} type="button">
              保存する
            </button>
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
