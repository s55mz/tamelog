import { useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { Feedback } from "../components/ui";
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
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!token || !message.trim()) return;
    setError("");
    setLoading(true);
    try {
      const data = await apiRequest<{ reply: string }>("/api/chat", {
        method: "POST",
        token,
        body: { message }
      });
      setReply(data.reply);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "送信に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout onLogout={onLogout} title="AI相談" user={user}>
      {/* ── Reply area ─────────────────────────────────── */}
      {reply ? (
        <div className="card">
          <p className="eyebrow" style={{ marginBottom: "var(--s3)" }}>返答</p>
          <div className="analysis-block">{reply}</div>
        </div>
      ) : null}

      {/* ── Input area ─────────────────────────────────── */}
      <div className="card form-stack">
        <p className="eyebrow">家計のことを相談する</p>
        <label className="field field--wide">
          <span className="field__label">相談内容</span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="例: 今月支出が多かったのですが、どう改善すればいいですか？"
            style={{ minHeight: "120px" }}
          />
        </label>
        <button
          className="btn btn--fill"
          onClick={() => void sendMessage()}
          disabled={loading || !message.trim()}
          type="button"
        >
          {loading ? "送信中..." : "相談する"}
        </button>
        {error ? <Feedback kind="err">{error}</Feedback> : null}
      </div>

      {/* ── Hint ───────────────────────────────────────── */}
      {!reply ? (
        <div className="card" style={{ borderStyle: "dashed" }}>
          <p className="eyebrow" style={{ marginBottom: "var(--s2)" }}>こんなことを聞けます</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s2)" }}>
            {["今月の支出傾向を教えて", "節約できそうな項目はある？", "目標達成のペースは順調？"].map((hint) => (
              <button
                className="btn btn--ghost"
                key={hint}
                onClick={() => setMessage(hint)}
                style={{ justifyContent: "flex-start", fontSize: "13px", color: "var(--text-2)", minHeight: "36px" }}
                type="button"
              >
                {hint}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
