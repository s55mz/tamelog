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
    setGoals((c) => [...c, { title: "", targetAmount: "", deadline: "" }]);
  };

  const updateGoal = (index: number, key: keyof GoalDraft, value: string) => {
    setGoals((c) => c.map((g, i) => (i === index ? { ...g, [key]: value } : g)));
  };

  const removeGoal = (index: number) => {
    setGoals((c) => c.filter((_, i) => i !== index));
  };

  const completeSetup = async () => {
    if (!token) { setError("セッションが切れました。再度ログインしてください。"); return; }
    setLoading(true); setError("");
    try {
      await apiRequest<{ success: boolean }>("/api/users/me/complete-setup", {
        method: "POST", token,
        body: {
          paydayOfMonth: Number(paydayOfMonth),
          initialAccount: accountEnabled
            ? { name: accountName || "メインの口座", type: accountType, balance: Number(accountBalance) }
            : undefined,
          goals: goals
            .filter((g) => g.title.trim() && g.targetAmount)
            .map((g) => ({
              title: g.title, targetAmount: Number(g.targetAmount),
              ...(g.deadline ? { deadline: g.deadline } : {})
            }))
        }
      });
      await onCompleted();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "初期設定に失敗しました");
    } finally { setLoading(false); }
  };

  return (
    <div className="wizard-wrap">
      <div className="wizard-card">
        {/* Brand */}
        <div className="row">
          <div className="auth-logo__mark">
            <span className="material-symbols-outlined">savings</span>
          </div>
          <span className="auth-logo__name">貯めログ</span>
        </div>

        {/* Step indicator */}
        <div className="wizard-steps">
          {stepLabels.map((label, index) => (
            <div className={`wizard-step-dot ${step >= index + 1 ? "on" : ""}`} key={label} title={label} />
          ))}
          <span className="wizard-step-label">
            {step} / {stepLabels.length} — {stepLabels[step - 1]}
          </span>
        </div>

        {/* Step 1: Welcome */}
        {step === 1 ? (
          <div className="form-stack">
            <div>
              <h2 className="page-h1">ようこそ</h2>
              <p className="text-sm">1 分ほどで終わる初期設定です。給料日・口座・目標を設定します。後から変更もできます。</p>
            </div>
            <button className="btn btn--fill btn--block" onClick={() => setStep(2)} type="button">
              はじめる
            </button>
          </div>
        ) : null}

        {/* Step 2: Payday */}
        {step === 2 ? (
          <div className="form-stack">
            <div>
              <h2 className="section-h2">給料日を設定</h2>
              <p className="text-sm">毎月何日に給料が入りますか？この日を基準に期間を管理します。</p>
            </div>
            <label className="field">
              <span className="field__label">毎月何日？</span>
              <select value={paydayOfMonth} onChange={(e) => setPaydayOfMonth(e.target.value)}>
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
            <h2 className="section-h2">最初の口座</h2>
            <label className="toggle-row">
              <input checked={accountEnabled} onChange={(e) => setAccountEnabled(e.target.checked)} type="checkbox" />
              最初の口座を登録する
            </label>
            {accountEnabled ? (
              <div className="form-grid">
                <label className="field">
                  <span className="field__label">口座名</span>
                  <input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="三井住友銀行" />
                </label>
                <label className="field">
                  <span className="field__label">種別</span>
                  <select value={accountType} onChange={(e) => setAccountType(e.target.value)}>
                    <option value="BANK">銀行口座</option>
                    <option value="CASH">現金</option>
                    <option value="CREDIT">クレジットカード</option>
                  </select>
                </label>
                <label className="field field--wide">
                  <span className="field__label">現在残高</span>
                  <input type="number" inputMode="numeric" min="0" value={accountBalance} onChange={(e) => setAccountBalance(e.target.value)} />
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
            <div>
              <h2 className="section-h2">目標を設定</h2>
              <p className="text-sm">最大 3 件まで追加できます。後から変更できます。</p>
            </div>
            {goals.map((goal, index) => (
              <div key={index} className="card form-stack">
                <div className="form-grid">
                  <label className="field"><span className="field__label">目標名</span><input value={goal.title} onChange={(e) => updateGoal(index, "title", e.target.value)} /></label>
                  <label className="field"><span className="field__label">目標金額</span><input type="number" inputMode="numeric" min="1" value={goal.targetAmount} onChange={(e) => updateGoal(index, "targetAmount", e.target.value)} /></label>
                  <label className="field field--wide"><span className="field__label">期限（任意）</span><input type="date" value={goal.deadline} onChange={(e) => updateGoal(index, "deadline", e.target.value)} /></label>
                </div>
                <button className="btn btn--del btn--sm" onClick={() => removeGoal(index)} type="button">削除</button>
              </div>
            ))}
            {goals.length < 3 ? (
              <button className="btn btn--out" onClick={addGoal} type="button">
                <span className="material-symbols-outlined">add</span>
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
