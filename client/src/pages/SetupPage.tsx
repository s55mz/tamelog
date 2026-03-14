import { useState } from "react";

import { Feedback } from "../components/ui";
import { apiRequest } from "../lib/api";

const stepLabels = ["ようこそ", "DB確認", "管理者", "設定", "完了"];

export function SetupPage() {
  const [step, setStep] = useState(1);
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
    setLoading(true);
    setError("");
    try {
      await apiRequest<{ success: boolean }>("/api/setup/test-db", { method: "POST", body: {} });
      setDbReady(true);
      setStep(3);
    } catch (nextError) {
      setDbReady(false);
      setError(nextError instanceof Error ? nextError.message : "DB 接続確認に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleInstall = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (form.password !== form.passwordConfirm) { setError("パスワード確認が一致しません"); return; }
    setLoading(true);
    setError("");
    try {
      await apiRequest<{ installed: boolean }>("/api/setup/install", {
        method: "POST",
        body: {
          adminName: form.adminName,
          adminEmail: form.adminEmail,
          password: form.password,
          appName: form.appName,
          paydayOfMonth: Number(form.paydayOfMonth)
        }
      });
      setStep(5);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "セットアップに失敗しました");
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
          <span style={{ fontSize: "18px", fontWeight: 700 }}>貯めログ</span>
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
              <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "var(--s2)" }}>初回セットアップ</h2>
              <p style={{ fontSize: "14px", color: "var(--text-2)", lineHeight: 1.7 }}>
                5 ステップで管理者アカウントと基本設定を作成します。
              </p>
            </div>
            <button className="btn btn--fill" onClick={() => setStep(2)} style={{ width: "100%" }} type="button">
              セットアップを始める
            </button>
          </div>
        ) : null}

        {/* Step 2: DB test */}
        {step === 2 ? (
          <div className="form-stack">
            <div>
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "var(--s2)" }}>データベース確認</h2>
              <p style={{ fontSize: "14px", color: "var(--text-2)" }}>PostgreSQL に接続できるか確認します。</p>
            </div>
            <button className="btn btn--fill" disabled={loading} onClick={() => void handleDbTest()} style={{ width: "100%" }} type="button">
              {loading ? "確認中..." : "DB 接続を確認"}
            </button>
            {dbReady ? <Feedback kind="ok">DB 接続に成功しました。</Feedback> : null}
          </div>
        ) : null}

        {/* Step 3 + 4: Admin form */}
        {step === 3 || step === 4 ? (
          <form className="form-stack" onSubmit={handleInstall}>
            <h2 style={{ fontSize: "18px", fontWeight: 700 }}>
              {step === 3 ? "管理者アカウント" : "アプリ設定"}
            </h2>
            <div className="form-grid">
              <label className="field"><span className="field__label">管理者名</span><input value={form.adminName} onChange={(event) => setForm({ ...form, adminName: event.target.value })} required /></label>
              <label className="field"><span className="field__label">メールアドレス</span><input type="email" value={form.adminEmail} onChange={(event) => setForm({ ...form, adminEmail: event.target.value })} required /></label>
              <label className="field"><span className="field__label">パスワード</span><input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></label>
              <label className="field"><span className="field__label">パスワード確認</span><input type="password" value={form.passwordConfirm} onChange={(event) => setForm({ ...form, passwordConfirm: event.target.value })} required /></label>
              <label className="field"><span className="field__label">アプリ名</span><input value={form.appName} onChange={(event) => setForm({ ...form, appName: event.target.value })} required /></label>
              <label className="field"><span className="field__label">給料日</span><input type="number" min="1" max="31" value={form.paydayOfMonth} onChange={(event) => setForm({ ...form, paydayOfMonth: event.target.value })} required /></label>
            </div>
            <div className="btn-row">
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
          <div className="form-stack">
            <div>
              <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "var(--s2)" }}>セットアップ完了</h2>
              <p style={{ fontSize: "14px", color: "var(--text-2)" }}>管理者アカウントを作成しました。ログイン画面へ進んでください。</p>
            </div>
            <Feedback kind="ok">インストールが完了しました。</Feedback>
            <button className="btn btn--fill" onClick={() => window.location.assign("/login")} style={{ width: "100%" }} type="button">
              ログインへ進む
            </button>
          </div>
        ) : null}

        {error ? <Feedback kind="err">{error}</Feedback> : null}
      </div>
    </div>
  );
}
