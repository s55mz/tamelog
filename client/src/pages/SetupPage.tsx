import { useRef, useState } from "react";

import { AppMetaFooter } from "../components/AppMetaFooter";
import { Feedback } from "../components/ui";
import { apiRequest } from "../lib/api";

const stepLabels = ["ようこそ", "DB確認", "管理者", "設定", "完了"];

export function SetupPage() {
  const [step, setStep] = useState(1);
  const touchStartX = useRef<number | null>(null);
  const [dbReady, setDbReady] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    adminName: "",
    adminEmail: "",
    password: "",
    passwordConfirm: "",
    appName: "貯めログ",
    paydayOfMonth: "25"
  });

  const handleDbTest = async () => {
    setLoading(true); setError("");
    try {
      await apiRequest<{ success: boolean }>("/api/setup/test-db", { method: "POST", body: {} });
      setDbReady(true); setStep(3);
    } catch (nextError) {
      setDbReady(false);
      setError(nextError instanceof Error ? nextError.message : "DB 接続確認に失敗しました");
    } finally { setLoading(false); }
  };

  const handleInstall = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (form.password !== form.passwordConfirm) { setError("パスワード確認が一致しません"); return; }
    setLoading(true); setError("");
    try {
      await apiRequest<{ installed: boolean }>("/api/setup/install", {
        method: "POST",
        body: {
          adminName: form.adminName, adminEmail: form.adminEmail, password: form.password,
          appName: form.appName, paydayOfMonth: Number(form.paydayOfMonth)
        }
      });
      setStep(5);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "セットアップに失敗しました");
    } finally { setLoading(false); }
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null) return;
    const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const deltaX = endX - touchStartX.current;
    touchStartX.current = null;

    if (Math.abs(deltaX) < 48) return;
    if (deltaX < 0 && step < stepLabels.length && step !== 5) {
      setStep((current) => Math.min(current + 1, stepLabels.length));
    }
    if (deltaX > 0 && step > 1 && step < 5) {
      setStep((current) => Math.max(current - 1, 1));
    }
  };

  return (
    <div className="wizard-wrap">
      <div className="wizard-card wizard-card--paged" onTouchEnd={handleTouchEnd} onTouchStart={handleTouchStart}>
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
          <div className="wizard-pane form-stack">
            <div>
              <h2 className="page-h1">初回セットアップ</h2>
              <p className="text-sm">管理者アカウントと基本設定を、iPhone の初期設定のような流れで整えます。</p>
            </div>
            <div className="wizard-actions">
              <button className="btn btn--fill btn--block" onClick={() => setStep(2)} type="button">
                セットアップを始める
              </button>
            </div>
          </div>
        ) : null}

        {/* Step 2: DB test */}
        {step === 2 ? (
          <div className="wizard-pane form-stack">
            <div>
              <h2 className="section-h2">データベース確認</h2>
              <p className="text-sm">PostgreSQL に接続できるか確認します。</p>
            </div>
            <div className="wizard-actions">
              <button className="btn btn--fill btn--block" disabled={loading} onClick={() => void handleDbTest()} type="button">
                {loading ? "確認中..." : "DB 接続を確認"}
              </button>
            </div>
            {dbReady ? <Feedback kind="ok">DB 接続に成功しました。</Feedback> : null}
          </div>
        ) : null}

        {/* Step 3 + 4: Admin form */}
        {step === 3 || step === 4 ? (
          <form className="wizard-pane form-stack" onSubmit={handleInstall}>
            <h2 className="section-h2">
              {step === 3 ? "管理者アカウント" : "アプリ設定"}
            </h2>
            <div className="form-grid">
              <label className="field"><span className="field__label">管理者名</span><input value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} placeholder="管理者名" required /></label>
              <label className="field"><span className="field__label">メールアドレス</span><input type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} placeholder="admin@example.com" required /></label>
              <label className="field"><span className="field__label">パスワード</span><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="8文字以上" required /></label>
              <label className="field"><span className="field__label">パスワード確認</span><input type="password" value={form.passwordConfirm} onChange={(e) => setForm({ ...form, passwordConfirm: e.target.value })} placeholder="もう一度入力" required /></label>
              <label className="field"><span className="field__label">アプリ名</span><input value={form.appName} onChange={(e) => setForm({ ...form, appName: e.target.value })} placeholder="貯めログ" required /></label>
              <label className="field"><span className="field__label">給料日</span><input type="number" inputMode="numeric" min="1" max="31" value={form.paydayOfMonth} onChange={(e) => setForm({ ...form, paydayOfMonth: e.target.value })} placeholder="25" required /></label>
            </div>
            <div className="btn-row wizard-actions">
              <button className="btn btn--out" onClick={() => setStep(step - 1)} type="button">戻る</button>
              {step === 3 ? (
                <button className="btn btn--fill" onClick={() => setStep(4)} type="button">次へ</button>
              ) : (
                <button className="btn btn--fill" disabled={loading} type="submit">{loading ? "作成中..." : "セットアップ完了"}</button>
              )}
            </div>
          </form>
        ) : null}

        {/* Step 5: Complete */}
        {step === 5 ? (
          <div className="wizard-pane form-stack">
            <div className="goal-empty">
              <span className="material-symbols-outlined" style={{ fontSize: "48px", color: "var(--emerald)" }}>check_circle</span>
              <h2 className="goal-empty__title">セットアップ完了</h2>
              <p className="goal-empty__sub">管理者アカウントを作成しました。</p>
            </div>
            <div className="wizard-actions">
              <button className="btn btn--fill btn--block" onClick={() => window.location.assign("/login")} type="button">
                ログインへ進む
              </button>
            </div>
          </div>
        ) : null}

        {error ? <Feedback kind="err">{error}</Feedback> : null}
        <AppMetaFooter className="layout-footer--auth" />
      </div>
    </div>
  );
}
