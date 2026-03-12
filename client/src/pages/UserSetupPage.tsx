import { useState } from "react";

import { apiRequest } from "../lib/api";

type UserSetupPageProps = {
  onCompleted: () => Promise<void>;
};

type GoalDraft = {
  title: string;
  targetAmount: string;
  deadline: string;
};

export function UserSetupPage({ onCompleted }: UserSetupPageProps) {
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [paydayOfMonth, setPaydayOfMonth] = useState("1");
  const [accountEnabled, setAccountEnabled] = useState(false);
  const [accountName, setAccountName] = useState("メイン口座");
  const [accountType, setAccountType] = useState("BANK");
  const [accountBalance, setAccountBalance] = useState("0");
  const [goals, setGoals] = useState<GoalDraft[]>([]);

  const addGoal = () => {
    if (goals.length >= 3) {
      return;
    }

    setGoals((current) => [...current, { title: "", targetAmount: "", deadline: "" }]);
  };

  const updateGoal = (index: number, key: keyof GoalDraft, value: string) => {
    setGoals((current) =>
      current.map((goal, goalIndex) => (goalIndex === index ? { ...goal, [key]: value } : goal))
    );
  };

  const removeGoal = (index: number) => {
    setGoals((current) => current.filter((_, goalIndex) => goalIndex !== index));
  };

  const completeSetup = async () => {
    setLoading(true);
    setError("");

    try {
      await apiRequest<{ success: boolean }>("/api/users/me/complete-setup", {
        method: "POST",
        body: {
          paydayOfMonth: Number(paydayOfMonth),
          initialAccount: accountEnabled
            ? {
                name: accountName,
                type: accountType,
                balance: Number(accountBalance)
              }
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
    <main className="screen-shell">
      <section className="panel panel-wide">
        <span className="eyebrow">UserSetupWizard</span>
        <h1>最初の設定</h1>
        <p className="lead">給料日、口座、目標を先に軽く決めます。口座と目標は後からでも追加できます。</p>

        <ol className="step-list step-list-four">
          <li className={step >= 1 ? "is-active" : ""}>1. はじめに</li>
          <li className={step >= 2 ? "is-active" : ""}>2. 給料日</li>
          <li className={step >= 3 ? "is-active" : ""}>3. 口座</li>
          <li className={step >= 4 ? "is-active" : ""}>4. 目標</li>
        </ol>

        {step === 1 && (
          <div className="stack">
            <p>1 分ほどで終わる初期設定です。後から設定画面で変更できます。</p>
            <button className="button" onClick={() => setStep(2)} type="button">
              はじめる
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="stack">
            <label className="field">
              <span>給料日</span>
              <input
                type="number"
                min="1"
                max="31"
                value={paydayOfMonth}
                onChange={(event) => setPaydayOfMonth(event.target.value)}
              />
            </label>
            <div className="button-row">
              <button className="button button-secondary" onClick={() => setStep(1)} type="button">
                戻る
              </button>
              <button className="button" onClick={() => setStep(3)} type="button">
                次へ
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="stack">
            <label className="checkbox-row">
              <input
                checked={accountEnabled}
                onChange={(event) => setAccountEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>最初の口座を登録する</span>
            </label>
            {accountEnabled && (
              <>
                <label className="field">
                  <span>口座名</span>
                  <input value={accountName} onChange={(event) => setAccountName(event.target.value)} />
                </label>
                <label className="field">
                  <span>種別</span>
                  <select value={accountType} onChange={(event) => setAccountType(event.target.value)}>
                    <option value="BANK">銀行口座</option>
                    <option value="CASH">現金</option>
                    <option value="CREDIT">クレジットカード</option>
                  </select>
                </label>
                <label className="field">
                  <span>残高</span>
                  <input
                    type="number"
                    min="0"
                    value={accountBalance}
                    onChange={(event) => setAccountBalance(event.target.value)}
                  />
                </label>
              </>
            )}
            <div className="button-row">
              <button className="button button-secondary" onClick={() => setStep(2)} type="button">
                戻る
              </button>
              <button className="button" onClick={() => setStep(4)} type="button">
                次へ
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="stack">
            <p>目標は最大 3 件まで先に作れます。後から追加しても構いません。</p>
            {goals.map((goal, index) => (
              <div className="subpanel" key={index}>
                <label className="field">
                  <span>目標名</span>
                  <input value={goal.title} onChange={(event) => updateGoal(index, "title", event.target.value)} />
                </label>
                <label className="field">
                  <span>目標金額</span>
                  <input
                    type="number"
                    min="1"
                    value={goal.targetAmount}
                    onChange={(event) => updateGoal(index, "targetAmount", event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>期限</span>
                  <input
                    type="date"
                    value={goal.deadline}
                    onChange={(event) => updateGoal(index, "deadline", event.target.value)}
                  />
                </label>
                <button className="button button-secondary" onClick={() => removeGoal(index)} type="button">
                  この目標を外す
                </button>
              </div>
            ))}
            {goals.length < 3 && (
              <button className="button button-secondary" onClick={addGoal} type="button">
                目標を追加
              </button>
            )}
            <div className="button-row">
              <button className="button button-secondary" onClick={() => setStep(3)} type="button">
                戻る
              </button>
              <button className="button" disabled={loading} onClick={completeSetup} type="button">
                {loading ? "保存中..." : "初期設定を完了"}
              </button>
            </div>
          </div>
        )}

        {error && <p className="error-text">{error}</p>}
      </section>
    </main>
  );
}
