import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { ProfileInstallGuide } from "../components/ProfileInstallGuide";
import { AuthFrame, Feedback } from "../components/ui";
import { clearSetupDraft } from "../lib/onboarding";
import { apiRequest } from "../lib/api";

type LoginPageProps = {
  onLogin: (token: string) => Promise<void>;
};

type AuthMode = "welcome" | "login" | "register";
type RegisterStep = "form" | "verify";

type AuthResponse = {
  token: string;
  user: { name: string };
};

function resolveInitialMode(mode: string | null, token: string) {
  if (mode === "login" || mode === "register") {
    return mode;
  }
  return token ? "register" : "welcome";
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = useMemo(() => searchParams.get("token") ?? "", [searchParams]);
  const requestedMode = searchParams.get("mode");
  const [mode, setMode] = useState<AuthMode>(() => resolveInitialMode(requestedMode, inviteToken));

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [registerToken, setRegisterToken] = useState(inviteToken);
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState("");
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState("");
  const [registerStep, setRegisterStep] = useState<RegisterStep>("form");
  const [verificationCode, setVerificationCode] = useState("");

  useEffect(() => {
    setMode(resolveInitialMode(requestedMode, inviteToken));
    setRegisterToken(inviteToken);
  }, [inviteToken, requestedMode]);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginLoading(true);
    setLoginError("");
    try {
      const data = await apiRequest<AuthResponse>("/api/auth/login", {
        method: "POST",
        body: { email: loginEmail, password: loginPassword }
      });
      await onLogin(data.token);
      navigate("/", { replace: true });
    } catch (nextError) {
      setLoginError(nextError instanceof Error ? nextError.message : "ログインに失敗しました");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSendVerification = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!registerToken.trim()) {
      setRegisterError("招待コードを入力してください");
      return;
    }
    if (registerPassword !== registerPasswordConfirm) {
      setRegisterError("パスワード確認が一致しません");
      return;
    }

    setRegisterLoading(true);
    setRegisterError("");
    try {
      await apiRequest("/api/auth/send-verification", {
        method: "POST",
        body: { email: registerEmail, inviteToken: registerToken.trim() }
      });
      setRegisterStep("verify");
    } catch (nextError) {
      setRegisterError(nextError instanceof Error ? nextError.message : "認証コードの送信に失敗しました");
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (verificationCode.length !== 6) {
      setRegisterError("6桁の認証コードを入力してください");
      return;
    }

    setRegisterLoading(true);
    setRegisterError("");
    try {
      const data = await apiRequest<AuthResponse>("/api/auth/register", {
        method: "POST",
        body: {
          token: registerToken.trim(),
          name: registerName,
          email: registerEmail,
          password: registerPassword,
          code: verificationCode
        }
      });
      clearSetupDraft();
      await onLogin(data.token);
      navigate("/user-setup", { replace: true });
    } catch (nextError) {
      setRegisterError(nextError instanceof Error ? nextError.message : "登録に失敗しました");
    } finally {
      setRegisterLoading(false);
    }
  };

  const title = mode === "register" ? "新規登録" : mode === "login" ? "ログイン" : "はじめる";

  return (
    <AuthFrame title={title}>
      {mode === "welcome" ? (
        <div className="auth-entry">
          <div className="auth-entry__copy">
            <p className="eyebrow">Welcome</p>
            <h2 className="section-h2">家計の初期設定を、軽く迷わず進めます。</h2>
            <p className="text-sm">
              新規登録のあと、そのまま初期設定へ進みます。招待コードを持っている場合はこの画面から登録できます。
            </p>
          </div>
          <div className="auth-entry__actions">
            <button className="btn btn--fill btn--block" onClick={() => setMode("register")} type="button">
              はじめる
            </button>
            <button className="btn btn--out btn--block" onClick={() => setMode("login")} type="button">
              ログイン
            </button>
          </div>
        </div>
      ) : null}

      {mode !== "welcome" ? (
        <div className="auth-mode">
          <button className="auth-back" onClick={() => setMode("welcome")} type="button">
            <span className="material-symbols-outlined">arrow_back</span>
            戻る
          </button>

          <div className="auth-mode-tabs" role="tablist" aria-label="認証モード">
            <button
              className={`auth-mode-tab ${mode === "login" ? "is-active" : ""}`}
              onClick={() => setMode("login")}
              role="tab"
              type="button"
            >
              ログイン
            </button>
            <button
              className={`auth-mode-tab ${mode === "register" ? "is-active" : ""}`}
              onClick={() => setMode("register")}
              role="tab"
              type="button"
            >
              新規登録
            </button>
          </div>

          {mode === "login" ? (
            <form className="form-stack" onSubmit={handleLogin}>
              <label className="field">
                <span className="field__label">メールアドレス</span>
                <input
                  autoComplete="email"
                  placeholder="name@example.com"
                  type="email"
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span className="field__label">パスワード</span>
                <input
                  autoComplete="current-password"
                  placeholder="8文字以上"
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  required
                />
              </label>
              <button className="btn btn--fill btn--block" disabled={loginLoading} type="submit">
                {loginLoading ? "ログイン中..." : "ログイン"}
              </button>
              {loginError ? <Feedback kind="err">{loginError}</Feedback> : null}
            </form>
          ) : null}

          {mode === "register" && registerStep === "form" ? (
            <form className="form-stack" onSubmit={handleSendVerification}>
              <label className="field">
                <span className="field__label">招待コード</span>
                <input
                  autoCapitalize="off"
                  placeholder="招待コードを入力"
                  value={registerToken}
                  onChange={(event) => setRegisterToken(event.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span className="field__label">名前</span>
                <input
                  autoComplete="name"
                  placeholder="田中 花子"
                  value={registerName}
                  onChange={(event) => setRegisterName(event.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span className="field__label">メールアドレス</span>
                <input
                  autoComplete="email"
                  placeholder="name@example.com"
                  type="email"
                  value={registerEmail}
                  onChange={(event) => setRegisterEmail(event.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span className="field__label">パスワード</span>
                <input
                  autoComplete="new-password"
                  placeholder="8文字以上"
                  type="password"
                  value={registerPassword}
                  onChange={(event) => setRegisterPassword(event.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span className="field__label">パスワード確認</span>
                <input
                  autoComplete="new-password"
                  placeholder="もう一度入力"
                  type="password"
                  value={registerPasswordConfirm}
                  onChange={(event) => setRegisterPasswordConfirm(event.target.value)}
                  required
                />
              </label>

              <div className="auth-guide-panel">
                <div>
                  <p className="eyebrow">Profile Guide</p>
                  <h3 className="wizard-action-card__title">プロファイル有効化の流れ</h3>
                  <p className="text-sm">
                    登録後はそのまま初期設定へ進みます。プロファイル設定が済んでいれば、セットアップ内でスキップできます。
                  </p>
                </div>
                <ProfileInstallGuide compact />
              </div>

              <button className="btn btn--fill btn--block" disabled={registerLoading} type="submit">
                {registerLoading ? "送信中..." : "確認コードを送信"}
              </button>
              {registerError ? <Feedback kind="err">{registerError}</Feedback> : null}
            </form>
          ) : null}

          {mode === "register" && registerStep === "verify" ? (
            <form className="form-stack" onSubmit={handleRegister}>
              <p className="text-sm" style={{ color: "var(--text-2)" }}>
                <strong>{registerEmail}</strong> に6桁の確認コードを送信しました。メールを確認してコードを入力してください。
              </p>
              <label className="field">
                <span className="field__label">確認コード</span>
                <input
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  placeholder="123456"
                  value={verificationCode}
                  onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, ""))}
                  required
                />
              </label>
              <button className="btn btn--fill btn--block" disabled={registerLoading} type="submit">
                {registerLoading ? "登録中..." : "登録してはじめる"}
              </button>
              <button
                className="btn btn--ghost btn--block"
                disabled={registerLoading}
                type="button"
                onClick={() => { setRegisterStep("form"); setRegisterError(""); setVerificationCode(""); }}
              >
                戻る
              </button>
              {registerError ? <Feedback kind="err">{registerError}</Feedback> : null}
            </form>
          ) : null}
        </div>
      ) : null}
    </AuthFrame>
  );
}
