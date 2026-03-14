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

const modeConfig: Record<RecordMode, { label: string; color: string; icon: string }> = {
  INCOME:   { label: "収入",   color: "var(--jade)",  icon: "arrow_downward" },
  EXPENSE:  { label: "支出",   color: "var(--coral)", icon: "arrow_upward" },
  SAVING:   { label: "貯金",   color: "var(--amber)", icon: "savings" },
  TRANSFER: { label: "移動",   color: "var(--sky)",   icon: "swap_horiz" }
};

const EMOTIONS = [
  { value: "嬉しい", emoji: "😊" },
  { value: "衝動的", emoji: "⚡" },
  { value: "不安",   emoji: "😰" },
  { value: "必要",   emoji: "✅" },
  { value: "疲れた", emoji: "😴" },
  { value: "後悔",   emoji: "😕" }
];

export function RecordPage({ user, onLogout }: RecordPageProps) {
  const token = getAuthToken();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [mode, setMode] = useState<RecordMode>("EXPENSE");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [form, setForm] = useState({
    accountId: "",
    categoryId: "",
    amount: "",
    memo: "",
    recordDate: new Date().toISOString().slice(0, 10),
    fromAccountId: "",
    toAccountId: "",
    goalId: "",
    emotions: [] as string[]
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

  const toggleEmotion = (value: string) => {
    setForm((current) => ({
      ...current,
      emotions: current.emotions.includes(value)
        ? current.emotions.filter((e) => e !== value)
        : [...current.emotions, value]
    }));
  };

  const resetInputFields = () => {
    setForm((current) => ({
      ...current,
      amount: "",
      memo: "",
      categoryId: "",
      goalId: "",
      emotions: [],
      recordDate: new Date().toISOString().slice(0, 10)
    }));
    setDetailsOpen(false);
  };

  const submitRecord = async () => {
    if (!token || !form.amount) return;
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
            recordDate: form.recordDate,
            emotions: form.emotions
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

  const cfg = modeConfig[mode];
  const amountNum = Number(form.amount || 0);

  return (
    <AppLayout onLogout={onLogout} title="記録" user={user}>
      {/* ── Mode selector ──────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--s2)" }}>
        {(["INCOME", "EXPENSE", "SAVING", "TRANSFER"] as RecordMode[]).map((item) => {
          const c = modeConfig[item];
          const active = mode === item;
          return (
            <button
              key={item}
              type="button"
              onClick={() => { setMode(item); setDetailsOpen(false); }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "4px",
                padding: "var(--s3) var(--s2)",
                borderRadius: "var(--r3)",
                border: active ? `2px solid ${c.color}` : "2px solid var(--border)",
                background: active ? `${c.color}18` : "var(--bg-1)",
                color: active ? c.color : "var(--text-2)",
                fontWeight: active ? 700 : 500,
                fontSize: "13px",
                cursor: "pointer",
                transition: "all 0.15s"
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>{c.icon}</span>
              {c.label}
            </button>
          );
        })}
      </div>

      {/* ── Amount display ─────────────────────────────── */}
      <div
        style={{
          background: "var(--bg-1)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r4)",
          padding: "var(--s5) var(--s5) var(--s4)",
          textAlign: "center"
        }}
      >
        <p
          style={{
            fontSize: "clamp(44px, 12vw, 72px)",
            fontWeight: 800,
            letterSpacing: "-0.04em",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
            color: amountNum > 0 ? cfg.color : "var(--text-3)",
            transition: "color 0.2s"
          }}
        >
          {amountNum > 0 ? formatCurrency(amountNum) : "¥ —"}
        </p>
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

      {/* ── Quick category chips (INCOME/EXPENSE) ──────── */}
      {(mode === "INCOME" || mode === "EXPENSE") && filteredCategories.length > 0 ? (
        <div>
          <p className="field__label" style={{ marginBottom: "var(--s2)" }}>カテゴリ</p>
          <div className="chip-group">
            <button
              className={`chip ${form.categoryId === "" ? "on" : ""}`}
              onClick={() => setForm({ ...form, categoryId: "" })}
              type="button"
            >
              なし
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

      {/* ── Emotion chips ──────────────────────────────── */}
      {(mode === "INCOME" || mode === "EXPENSE") ? (
        <div>
          <p className="field__label" style={{ marginBottom: "var(--s2)" }}>気持ち（任意）</p>
          <div className="chip-group">
            {EMOTIONS.map((em) => (
              <button
                className={`chip ${form.emotions.includes(em.value) ? "on" : ""}`}
                key={em.value}
                onClick={() => toggleEmotion(em.value)}
                type="button"
              >
                {em.emoji} {em.value}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Details toggle ─────────────────────────────── */}
      <button
        className="btn btn--ghost"
        onClick={() => setDetailsOpen((prev) => !prev)}
        style={{ justifyContent: "space-between", fontSize: "13px" }}
        type="button"
      >
        <span>詳細設定（口座・メモ・日付）</span>
        <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
          {detailsOpen ? "expand_less" : "expand_more"}
        </span>
      </button>

      {detailsOpen ? (
        <div className="card form-stack">
          {/* Income / Expense: account select */}
          {(mode === "INCOME" || mode === "EXPENSE") ? (
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
          ) : null}

          {/* Saving / Transfer: from/to selects */}
          {(mode === "SAVING" || mode === "TRANSFER") ? (
            <div className="form-grid">
              <label className="field">
                <span className="field__label">{mode === "SAVING" ? "元口座" : "移動元"}</span>
                <select
                  value={form.fromAccountId}
                  onChange={(event) => setForm({ ...form, fromAccountId: event.target.value })}
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
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
                    <option key={account.id} value={account.id}>{account.name}</option>
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
                      <option key={goal.id} value={goal.id}>{goal.title}</option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}

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
      ) : null}

      {/* ── Save button ────────────────────────────────── */}
      <button
        className="btn btn--fill"
        disabled={!form.amount}
        onClick={() => void submitRecord()}
        style={{
          width: "100%",
          minHeight: "56px",
          fontSize: "16px",
          borderRadius: "var(--r3)",
          background: cfg.color,
          border: "none"
        }}
        type="button"
      >
        {cfg.label}を保存する
      </button>

      {message ? <Feedback kind="ok">{message}</Feedback> : null}
      {error ? <Feedback kind="err">{error}</Feedback> : null}
    </AppLayout>
  );
}
