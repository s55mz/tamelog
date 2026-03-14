import { useState } from "react";

import { Feedback } from "../components/ui";
import { apiRequest } from "../lib/api";
import { getAuthToken } from "../lib/storage";

type UserSetupPageProps = {
  onCompleted: () => Promise<void>;
};

type GoalDraft = { title: string; targetAmount: string; deadline: string };

const stepLabels = ["はじめに", "給料日", "口座", "目標"];

export function UserSetupPage({ onCompleted }: UserSetupPageProps) {
  const token = getAuthToken();
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [paydayOfMonth, setPaydayOfMonth] = useState("25");
  const [accountEnabled, setAccountEnabled] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState("BANK");
  const [accountBalance, setAccountBalance] = useState("0");
  const [goals, setGoals] = useState<GoalDraft[]>([]);

  const addGoal = () => {
    if (goals.length >= 3) return;
    setGoals((current) => [...current, { title: "", targetAmount: "", deadline: "" }]);
  };

  const updateGoal = (index: number, key: keyof GoalDraft, value: string) => {
    setGoals((current) => current.map((goal, goalIndex) => (goalIndex === index ? { ...goal, [key]: value } : goal)));
  };

  const removeGoal = (index: number) => {
    setGoals((current) => current.filter((_, goalIndex) => goalIndex !== index));
  };

  const completeSetup = async () => {
    if (!token) {
      setError("セッションが切れました。再度ログインしてください。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await apiRequest<{ success: boolean }>("/api/users/me/complete-setup", {
        method: "POST",
        token,
        body: {
          paydayOfMonth: Number(paydayOfMonth),
          initialAccount: accountEnabled
            ? { name: accountName || "メインの口座", type: accountType, balance: Number(accountBalance) }
            : undefined,
          goals: goals
            .filter((goal) => goal.title.trim() && goal.targetAmount)
            .map((goal) => ({
              title: goal.title,
              targetAmount: Number(goal.targetAmount),
              ...(goal.deadline ? { deadline: goal.deadline } : {})
            }))
        }
      });
      await onCompleted();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "初期設定に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wizard-wrap">
      <div className="wizard-card">
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s3)" }}>
          <div className="auth-logo__mark">
            <span className="material-symbols-outlined">savings</span>
          </div>
          <span style={{ fontSize: "18px", fontWeight: 700, fontFamily: "'Outfit', sans-serif" }}>最初の設定</span>
        </div>

        {/* Step dots */}
        <div className="wizard-steps">
          {stepLabels.map((label, index) => (
            <div
              className={`wizard-step-dot ${step >= index + 1 ? "on" : ""}`}
              key={label}
              title={label}
            />
          ))}
          <span style={{ fontSize: "12px", color: "var(--text-2)", marginLeft: "var(--s2)" }}>
            {stepLabels[step - 1]}
          </span>
        </div>

        {/* Step 1: Welcome */}
        {step === 1 ? (
          <div className="form-stack">
            <div>
              <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "var(--s2)", fontFamily: "'Outfit', sans-serif" }}>ようこそ</h2>
              <p style={{ fontSize: "14px", color: "var(--text-2)", lineHeight: 1.7 }}>
                1 分ほどで終わる初期設定です。給料日・口座・目標を設定します。後から変更もできます。
              </p>
            </div>
            <button className="btn btn--fill" onClick={() => setStep(2)} style={{ width: "100%" }} type="button">
              はじめる
            </button>
          </div>
        ) : null}

        {/* Step 2: Payday */}
        {step === 2 ? (
          <div className="form-stack">
            <h2 style={{ fontSize: "18px", fontWeight: 700, fontFamily: "'Outfit', sans-serif" }}>給料日を設定</h2>
            <p style={{ fontSize: "13px", color: "var(--text-2)" }}>毎月何日に給料が入りますか？この日を基準に期間を管理します。</p>
            <label className="field">
              <span className="field__label">毎月何日？</span>
              <select
                value={paydayOfMonth}
                onChange={(event) => setPaydayOfMonth(event.target.value)}
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <option key={day} value={day}>{day}日</option>
                ))}
              </select>
            </label>
            <div className="btn-row">
              <button className="btn btn--out" onClick={() => setStep(1)} type="button">戻る</button>
              <button className="btn btn--fill" onClick={() => setStep(3)} type="button">次へ</button>
            </div>
          </div>
        ) : null}

        {/* Step 3: Account */}
        {step === 3 ? (
          <div className="form-stack">
            <h2 style={{ fontSize: "18px", fontWeight: 700, fontFamily: "'Outfit', sans-serif" }}>最初の口座</h2>
            <label className="toggle-row">
              <input checked={accountEnabled} onChange={(event) => setAccountEnabled(event.target.checked)} type="checkbox" />
              最初の口座を登録する
            </label>
            {accountEnabled ? (
              <div className="form-grid">
                <label className="field">
                  <span className="field__label">口座名</span>
                  <input
                    value={accountName}
                    onChange={(event) => setAccountName(event.target.value)}
                    placeholder="三井住友銀行"
                  />
                </label>
                <label className="field">
                  <span className="field__label">種別</span>
                  <select value={accountType} onChange={(event) => setAccountType(event.target.value)}>
                    <option value="BANK">銀行口座</option>
                    <option value="CASH">現金</option>
                    <option value="CREDIT">クレジットカード</option>
                  </select>
                </label>
                <label className="field field--wide">
                  <span className="field__label">現在残高</span>
                  <input type="number" min="0" value={accountBalance} onChange={(event) => setAccountBalance(event.target.value)} />
                </label>
              </div>
            ) : null}
            <div className="btn-row">
              <button className="btn btn--out" onClick={() => setStep(2)} type="button">戻る</button>
              <button className="btn btn--fill" onClick={() => setStep(4)} type="button">次へ</button>
            </div>
          </div>
        ) : null}

        {/* Step 4: Goals */}
        {step === 4 ? (
          <div className="form-stack">
            <h2 style={{ fontSize: "18px", fontWeight: 700, fontFamily: "'Outfit', sans-serif" }}>目標を設定</h2>
            <p style={{ fontSize: "13px", color: "var(--text-2)" }}>最大 3 件まで追加できます。後から変更できます。</p>
            {goals.map((goal, index) => (
              <div
                key={index}
                style={{
                  background: "var(--bg-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r3)",
                  padding: "var(--s4)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--s3)"
                }}
              >
                <div className="form-grid">
                  <label className="field"><span className="field__label">目標名</span><input value={goal.title} onChange={(event) => updateGoal(index, "title", event.target.value)} /></label>
                  <label className="field"><span className="field__label">目標金額</span><input type="number" min="1" value={goal.targetAmount} onChange={(event) => updateGoal(index, "targetAmount", event.target.value)} /></label>
                  <label className="field field--wide"><span className="field__label">期限（任意）</span><input type="date" value={goal.deadline} onChange={(event) => updateGoal(index, "deadline", event.target.value)} /></label>
                </div>
                <button className="btn btn--del btn--sm" onClick={() => removeGoal(index)} style={{ alignSelf: "flex-start" }} type="button">
                  削除
                </button>
              </div>
            ))}
            {goals.length < 3 ? (
              <button className="btn btn--out" onClick={addGoal} type="button">
                <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>add</span>
                目標を追加
              </button>
            ) : null}
            <div className="btn-row">
              <button className="btn btn--out" onClick={() => setStep(3)} type="button">戻る</button>
              <button className="btn btn--fill" disabled={loading} onClick={() => void completeSetup()} type="button">
                {loading ? "保存中..." : "設定を完了する"}
              </button>
            </div>
          </div>
        ) : null}

        {error ? <Feedback kind="err">{error}</Feedback> : null}
      </div>
    </div>
  );
}
