import { useState } from "react";

import { apiRequest } from "../lib/api";

type LoginPageProps = {
  onLogin: (token: string) => Promise<void>;
};

type LoginResponse = {
  token: string;
  user: {
    name: string;
  };
};

export function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const data = await apiRequest<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: { email, password }
      });
      await onLogin(data.token);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="screen-shell">
      <section className="panel">
        <span className="eyebrow">LoginPage</span>
        <h1>ログイン</h1>
        <p className="lead">招待制のため、登録には招待リンクが必要です。</p>
        <form className="stack" onSubmit={handleSubmit}>
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
          <button className="button" disabled={loading} type="submit">
            {loading ? "ログイン中..." : "ログイン"}
          </button>
        </form>
        {error && <p className="error-text">{error}</p>}
      </section>
    </main>
  );
}
