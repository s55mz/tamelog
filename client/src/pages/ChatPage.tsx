import { useEffect, useRef, useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { apiRequest } from "../lib/api";
import { formatDateTimeJP } from "../lib/format";
import { getAuthToken } from "../lib/storage";
import type { AppUser } from "../lib/types";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

type ChatPageProps = {
  user: AppUser;
  onLogout: () => Promise<void>;
};

const HINTS = [
  "今月の支出傾向を教えて",
  "節約できそうな項目はある？",
  "目標達成のペースは順調？",
  "先月より支出が増えた理由は？"
];

export function ChatPage({ user, onLogout }: ChatPageProps) {
  const token = getAuthToken();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!token || !text.trim() || loading) return;
    setError("");

    const userMsg: ChatMessage = { role: "user", content: text.trim(), timestamp: new Date() };
    const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const data = await apiRequest<{ reply: string }>("/api/chat", {
        method: "POST",
        token,
        body: { message: text.trim(), history }
      });

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: data.reply,
        timestamp: new Date()
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "送信に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  };

  return (
    <AppLayout onLogout={onLogout} title="AI相談" user={user}>
      {/* ── Chat window ─────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--s3)",
          minHeight: "300px"
        }}
      >
        {messages.length === 0 ? (
          /* ── Hints ─────────────────────────────────────── */
          <div className="card" style={{ borderStyle: "dashed" }}>
            <p className="eyebrow" style={{ marginBottom: "var(--s3)" }}>AI 家計アドバイザー</p>
            <p style={{ fontSize: "13px", color: "var(--text-2)", marginBottom: "var(--s4)", lineHeight: 1.7 }}>
              あなたの収支データをもとに、節約・貯金・支出の改善をアドバイスします。
            </p>
            <p className="eyebrow" style={{ marginBottom: "var(--s2)" }}>よくある質問</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--s2)" }}>
              {HINTS.map((hint) => (
                <button
                  className="btn btn--out"
                  key={hint}
                  onClick={() => void sendMessage(hint)}
                  style={{ justifyContent: "flex-start", fontSize: "13px", textAlign: "left" }}
                  type="button"
                >
                  {hint}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Message bubbles */}
        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: msg.role === "user" ? "flex-end" : "flex-start",
              gap: "4px"
            }}
          >
            <div
              style={{
                maxWidth: "80%",
                padding: "var(--s3) var(--s4)",
                borderRadius: msg.role === "user"
                  ? "var(--r3) var(--r3) var(--r1) var(--r3)"
                  : "var(--r3) var(--r3) var(--r3) var(--r1)",
                background: msg.role === "user"
                  ? "var(--amber)"
                  : "var(--bg-1)",
                color: msg.role === "user" ? "#fff" : "var(--text)",
                border: msg.role === "user" ? "none" : "1px solid var(--border)",
                boxShadow: "var(--shadow-xs)",
                fontSize: "14px",
                lineHeight: 1.65,
                whiteSpace: "pre-wrap"
              }}
            >
              {msg.content}
            </div>
            <span style={{ fontSize: "10px", color: "var(--text-3)" }}>
              {msg.role === "assistant" ? "AI · " : ""}{formatDateTimeJP(msg.timestamp)}
            </span>
          </div>
        ))}

        {/* Loading indicator */}
        {loading ? (
          <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--s2)" }}>
            <div
              style={{
                padding: "var(--s3) var(--s4)",
                borderRadius: "var(--r3) var(--r3) var(--r3) var(--r1)",
                background: "var(--bg-1)",
                border: "1px solid var(--border)",
                display: "flex",
                gap: "4px",
                alignItems: "center"
              }}
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: "var(--text-3)",
                    animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                    display: "inline-block"
                  }}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div ref={bottomRef} />
      </div>

      {error ? (
        <p style={{ fontSize: "12px", color: "var(--coral)", padding: "var(--s2) 0" }}>{error}</p>
      ) : null}

      {/* ── Input area ─────────────────────────────────── */}
      <div
        style={{
          position: "sticky",
          bottom: "calc(80px + env(safe-area-inset-bottom))",
          background: "var(--bg)",
          paddingTop: "var(--s3)"
        }}
      >
        <div
          className="card"
          style={{
            padding: "var(--s3)",
            display: "flex",
            gap: "var(--s2)",
            alignItems: "flex-end"
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="メッセージを入力… (Enter で送信)"
            rows={1}
            style={{
              flex: 1,
              background: "var(--bg-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r2)",
              padding: "10px var(--s3)",
              fontSize: "14px",
              color: "var(--text)",
              resize: "none",
              outline: "none",
              lineHeight: 1.5,
              maxHeight: "120px",
              overflowY: "auto",
              fontFamily: "inherit"
            }}
            disabled={loading}
          />
          <button
            className="btn btn--fill"
            disabled={loading || !input.trim()}
            onClick={() => void sendMessage(input)}
            style={{ minHeight: "42px", width: "42px", padding: 0, borderRadius: "var(--r2)", flexShrink: 0 }}
            type="button"
            aria-label="送信"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>send</span>
          </button>
        </div>
        <p style={{ fontSize: "10px", color: "var(--text-3)", textAlign: "center", marginTop: "4px" }}>
          Shift+Enter で改行 · Enter で送信
        </p>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </AppLayout>
  );
}
