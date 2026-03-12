import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

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

    if (!token) {
      setError("招待リンクが必要です");
      return;
    }

    if (password !== passwordConfirm) {
      setError("パスワード確認が一致しません");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await apiRequest<{ user: { id: string } }>("/api/auth/register", {
        method: "POST",
        body: {
          token,
          name,
          email,
          password
        }
      });
      setSuccess("登録が完了しました。ログイン画面へ進んでください。");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "登録に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <main className="screen-shell">
        <section className="panel">
          <span className="eyebrow">RegisterPage</span>
          <h1>新規登録</h1>
          <p className="lead">この画面には招待リンクからアクセスしてください。</p>
        </section>
      </main>
    );
  }

  return (
    <main className="screen-shell">
      <section className="panel">
        <span className="eyebrow">RegisterPage</span>
        <h1>新規登録</h1>
        <form className="stack" onSubmit={handleSubmit}>
          <label className="field">
            <span>名前</span>
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label className="field">
            <span>メールアドレス</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label className="field">
            <span>パスワード</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>パスワード確認</span>
            <input
              type="password"
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
              required
            />
          </label>
          <button className="button" disabled={loading} type="submit">
            {loading ? "登録中..." : "登録する"}
          </button>
        </form>
        {error && <p className="error-text">{error}</p>}
        {success && (
          <p className="success-text">
            {success} <Link to="/login">ログインへ</Link>
          </p>
        )}
      </section>
    </main>
  );
}
