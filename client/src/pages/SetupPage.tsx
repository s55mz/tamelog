import { useState } from "react";
import { apiRequest } from "../lib/api";

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
      await apiRequest<{ success: boolean }>("/api/setup/test-db", {
        method: "POST",
        body: {}
      });
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

    if (form.password !== form.passwordConfirm) {
      setError("パスワード確認が一致しません");
      return;
    }

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
    <main className="screen-shell">
      <section className="panel panel-wide">
        <span className="eyebrow">SetupWizard</span>
        <h1>初回セットアップ</h1>
        <p className="lead">5 ステップで管理者と基本設定を作成します。</p>

        <ol className="step-list">
          <li className={step >= 1 ? "is-active" : ""}>1. Welcome</li>
          <li className={step >= 2 ? "is-active" : ""}>2. Database</li>
          <li className={step >= 3 ? "is-active" : ""}>3. Admin</li>
          <li className={step >= 4 ? "is-active" : ""}>4. Settings</li>
          <li className={step >= 5 ? "is-active" : ""}>5. Complete</li>
        </ol>

        {step === 1 && (
          <div className="stack">
            <p>まず DB 接続を確認し、その後に管理者とアプリ名を登録します。</p>
            <button className="button" onClick={() => setStep(2)} type="button">
              セットアップを始める
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="stack">
            <p>PostgreSQL に接続できるか確認します。</p>
            <button className="button" onClick={handleDbTest} disabled={loading} type="button">
              {loading ? "確認中..." : "DB 接続を確認する"}
            </button>
            {dbReady && <p className="success-text">DB 接続に成功しました。</p>}
          </div>
        )}

        {(step === 3 || step === 4) && (
          <form className="stack" onSubmit={handleInstall}>
            <label className="field">
              <span>管理者名</span>
              <input
                value={form.adminName}
                onChange={(event) => setForm({ ...form, adminName: event.target.value })}
                required
              />
            </label>
            <label className="field">
              <span>メールアドレス</span>
              <input
                type="email"
                value={form.adminEmail}
                onChange={(event) => setForm({ ...form, adminEmail: event.target.value })}
                required
              />
            </label>
            <label className="field">
              <span>パスワード</span>
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                required
              />
            </label>
            <label className="field">
              <span>パスワード確認</span>
              <input
                type="password"
                value={form.passwordConfirm}
                onChange={(event) => setForm({ ...form, passwordConfirm: event.target.value })}
                required
              />
            </label>
            <label className="field">
              <span>アプリ名</span>
              <input
                value={form.appName}
                onChange={(event) => setForm({ ...form, appName: event.target.value })}
                required
              />
            </label>
            <label className="field">
              <span>給料日</span>
              <input
                type="number"
                min="1"
                max="31"
                value={form.paydayOfMonth}
                onChange={(event) => setForm({ ...form, paydayOfMonth: event.target.value })}
                required
              />
            </label>
            <div className="button-row">
              {step === 3 && (
                <button className="button button-secondary" onClick={() => setStep(2)} type="button">
                  戻る
                </button>
              )}
              {step === 3 ? (
                <button className="button" onClick={() => setStep(4)} type="button">
                  次へ
                </button>
              ) : (
                <button className="button" disabled={loading} type="submit">
                  {loading ? "作成中..." : "セットアップ完了"}
                </button>
              )}
            </div>
          </form>
        )}

        {step === 5 && (
          <div className="stack">
            <p>セットアップが完了しました。ログイン画面へ進みます。</p>
            <button className="button" onClick={() => window.location.assign("/login")} type="button">
              ログインへ進む
            </button>
          </div>
        )}

        {error && <p className="error-text">{error}</p>}
      </section>
    </main>
  );
}
