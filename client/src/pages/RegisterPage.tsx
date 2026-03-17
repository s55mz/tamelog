import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { AuthFrame, Feedback } from "../components/ui";
import { apiRequest } from "../lib/api";

export function RegisterPage() {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) { setError("招待リンクが必要です"); return; }
    if (password !== passwordConfirm) { setError("パスワード確認が一致しません"); return; }
    setLoading(true);
    setError("");
    try {
      await apiRequest<{ user: { id: string } }>("/api/auth/register", {
        method: "POST",
        body: { token, name, email, password }
      });
      setSuccess("登録が完了しました。ログイン画面へ進んでください。");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "登録に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthFrame title="新規登録">
      {token ? (
        <form className="form-stack" onSubmit={handleSubmit}>
          <label className="field"><span className="field__label">名前</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="田中 花子" required /></label>
          <label className="field"><span className="field__label">メールアドレス</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required /></label>
          <label className="field"><span className="field__label">パスワード</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="8文字以上" required /></label>
          <label className="field"><span className="field__label">パスワード確認</span><input type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} placeholder="もう一度入力" required /></label>
          <button className="btn btn--fill" disabled={loading} style={{ width: "100%", minHeight: "48px" }} type="submit">
            {loading ? "登録中..." : "登録する"}
          </button>
          {error ? <Feedback kind="err">{error}</Feedback> : null}
          {success ? (
            <Feedback kind="ok">
              {success} <Link style={{ color: "var(--amber)" }} to="/login">ログインへ</Link>
            </Feedback>
          ) : null}
        </form>
      ) : (
        <Feedback kind="err">招待リンクが必要です。管理者から招待リンクを受け取ってアクセスしてください。</Feedback>
      )}
    </AuthFrame>
  );
}
