import { useEffect, useMemo, useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { Feedback } from "../components/ui";
import { apiRequest } from "../lib/api";
import { formatCurrency } from "../lib/format";
import { getAuthToken } from "../lib/storage";
import type { AppUser } from "../lib/types";

type Account = { id: string; name: string; type: string; balance: number };
type Category = { id: string; name: string; type: string };
type Goal = { id: string; title: string };
type RecordMode = "INCOME" | "EXPENSE" | "SAVING" | "TRANSFER";

type RecordPageProps = {
  user: AppUser;
  onLogout: () => Promise<void>;
};

const modeLabel: Record<RecordMode, string> = {
  INCOME: "収入",
  EXPENSE: "支出",
  SAVING: "貯金",
  TRANSFER: "移動"
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
    if (!token) return;
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
        toAccountId:
          current.toAccountId ||
          accountsData.accounts[1]?.id ||
          accountsData.accounts[0]?.id ||
          ""
      }));
    });
  }, [token]);

  const keypadValues = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "del"];

  const appendAmount = (value: string) => {
    if (value === "del") {
      setForm((current) => ({ ...current, amount: current.amount.slice(0, -1) }));
      return;
    }
    setForm((current) => ({
      ...current,
      amount: `${current.amount}${value}`.replace(/^0+(?=\d)/, "")
    }));
  };

  const filteredCategories = useMemo(
    () => categories.filter((category) => category.type === mode),
    [categories, mode]
  );

  const resetInputFields = () => {
    setForm((current) => ({ ...current, amount: "", memo: "", categoryId: "", goalId: "" }));
  };

  const submitRecord = async () => {
    if (!token) return;
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
    <AppLayout onLogout={onLogout} title="記録" user={user}>
      {/* ── Mode tabs ──────────────────────────────────── */}
      <div className="seg">
        {(["INCOME", "EXPENSE", "SAVING", "TRANSFER"] as RecordMode[]).map((item) => (
          <button
            className={`seg__btn ${mode === item ? "on" : ""}`}
            key={item}
            onClick={() => setMode(item)}
            type="button"
          >
            {modeLabel[item]}
          </button>
        ))}
      </div>

      {/* ── Amount display ─────────────────────────────── */}
      <div className="card" style={{ textAlign: "center", padding: "var(--s7) var(--s5) var(--s6)" }}>
        <p className="eyebrow" style={{ marginBottom: "var(--s3)" }}>金額</p>
        <p
          style={{
            fontSize: "clamp(40px, 10vw, 64px)",
            fontWeight: 800,
            letterSpacing: "-0.04em",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
            color: mode === "EXPENSE" ? "var(--coral)" : mode === "INCOME" ? "var(--jade)" : mode === "SAVING" ? "var(--orange)" : "var(--sky)"
          }}
        >
          {formatCurrency(Number(form.amount || 0))}
        </p>
      </div>

      {/* ── Form fields ────────────────────────────────── */}
      <div className="card form-stack">
        {/* Income / Expense */}
        {(mode === "INCOME" || mode === "EXPENSE") && (
          <>
            <label className="field">
              <span className="field__label">口座</span>
              <select
                value={form.accountId}
                onChange={(event) => setForm({ ...form, accountId: event.target.value })}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>

            {filteredCategories.length > 0 ? (
              <div>
                <p className="field__label" style={{ marginBottom: "var(--s2)" }}>カテゴリ</p>
                <div className="chip-group">
                  <button
                    className={`chip ${form.categoryId === "" ? "on" : ""}`}
                    onClick={() => setForm({ ...form, categoryId: "" })}
                    type="button"
                  >
                    未選択
                  </button>
                  {filteredCategories.map((category) => (
                    <button
                      className={`chip ${form.categoryId === category.id ? "on" : ""}`}
                      key={category.id}
                      onClick={() => setForm({ ...form, categoryId: category.id })}
                      type="button"
                    >
                      {category.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}

        {/* Saving / Transfer */}
        {(mode === "SAVING" || mode === "TRANSFER") && (
          <div className="form-grid">
            <label className="field">
              <span className="field__label">{mode === "SAVING" ? "元口座" : "移動元"}</span>
              <select
                value={form.fromAccountId}
                onChange={(event) => setForm({ ...form, fromAccountId: event.target.value })}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">{mode === "SAVING" ? "着地口座" : "移動先"}</span>
              <select
                value={form.toAccountId}
                onChange={(event) => setForm({ ...form, toAccountId: event.target.value })}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            {mode === "SAVING" ? (
              <label className="field">
                <span className="field__label">目標</span>
                <select
                  value={form.goalId}
                  onChange={(event) => setForm({ ...form, goalId: event.target.value })}
                >
                  <option value="">選択しない</option>
                  {goals.map((goal) => (
                    <option key={goal.id} value={goal.id}>
                      {goal.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        )}

        <div className="form-grid">
          <label className="field">
            <span className="field__label">日付</span>
            <input
              type="date"
              value={form.recordDate}
              onChange={(event) => setForm({ ...form, recordDate: event.target.value })}
            />
          </label>
          <label className="field">
            <span className="field__label">メモ</span>
            <input
              value={form.memo}
              onChange={(event) => setForm({ ...form, memo: event.target.value })}
              placeholder="任意"
            />
          </label>
        </div>
      </div>

      {/* ── Keypad ─────────────────────────────────────── */}
      <div className="keypad">
        {keypadValues.map((value) => (
          <button
            className="keypad__key"
            key={value}
            onClick={() => appendAmount(value)}
            type="button"
          >
            {value === "del" ? (
              <span className="material-symbols-outlined" style={{ fontSize: "22px" }}>backspace</span>
            ) : (
              value
            )}
          </button>
        ))}
      </div>

      {/* ── Save button ────────────────────────────────── */}
      <button
        className="btn btn--fill"
        onClick={() => void submitRecord()}
        style={{ width: "100%", minHeight: "52px", fontSize: "16px", borderRadius: "var(--r3)" }}
        type="button"
      >
        保存する
      </button>

      {message ? <Feedback kind="ok">{message}</Feedback> : null}
      {error ? <Feedback kind="err">{error}</Feedback> : null}
    </AppLayout>
  );
}
