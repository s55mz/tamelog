import { useState } from "react";

import { AuthFrame, Feedback } from "../components/ui";
import { apiRequest } from "../lib/api";

type LoginPageProps = {
  onLogin: (token: string) => Promise<void>;
};

type LoginResponse = {
  token: string;
  user: { name: string };
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
    <AuthFrame title="ログイン">
      <form className="form-stack" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field__label">メールアドレス</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            required
          />
        </label>
        <label className="field">
          <span className="field__label">パスワード</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="8文字以上"
            required
          />
        </label>
        <button className="btn btn--fill" disabled={loading} style={{ width: "100%", minHeight: "48px" }} type="submit">
          {loading ? "ログイン中..." : "ログイン"}
        </button>
        {error ? <Feedback kind="err">{error}</Feedback> : null}
      </form>
    </AuthFrame>
  );
}
