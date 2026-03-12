import { useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { apiRequest } from "../lib/api";
import { getAuthToken } from "../lib/storage";
import type { AppUser } from "../lib/types";

type ChatPageProps = {
  user: AppUser;
  onLogout: () => Promise<void>;
};

export function ChatPage({ user, onLogout }: ChatPageProps) {
  const token = getAuthToken();
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");

  const sendMessage = async () => {
    if (!token) {
      return;
    }

    setError("");

    try {
      const data = await apiRequest<{ reply: string }>("/api/chat", {
        method: "POST",
        token,
        body: { message }
      });
      setReply(data.reply);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "送信に失敗しました");
    }
  };

  return (
    <AppLayout onLogout={onLogout} subtitle="家計状況を踏まえた短い相談応答を返す画面です。" title="AI相談" user={user}>
      <section className="content-section">
        <article className="surface-card form-card">
          <p className="section-label">Message</p>
          <div className="stack compact">
          <label className="field">
            <span>相談内容</span>
            <input value={message} onChange={(event) => setMessage(event.target.value)} />
          </label>
          <button className="button" onClick={sendMessage} type="button">
            相談する
          </button>
          {reply && <article className="subpanel"><p>{reply}</p></article>}
          {error && <p className="error-text">{error}</p>}
          </div>
        </article>
      </section>
    </AppLayout>
  );
}
