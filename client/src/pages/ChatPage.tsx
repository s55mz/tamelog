import { useState } from "react";

import { apiRequest } from "../lib/api";
import { getAuthToken } from "../lib/storage";

export function ChatPage() {
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
    <main className="screen-shell">
      <section className="panel panel-wide">
        <span className="eyebrow">Chat</span>
        <h1>AI 相談</h1>
        <div className="stack">
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
      </section>
    </main>
  );
}
