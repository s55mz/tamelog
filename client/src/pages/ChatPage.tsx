import { useEffect, useRef, useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { Markdown } from "../components/Markdown";
import { apiRequest } from "../lib/api";
import { formatDateTimeJP } from "../lib/format";
import { getAuthToken } from "../lib/storage";
import type { AppUser } from "../lib/types";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
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

const STORAGE_KEY = "tamelog-chat-history";
const MAX_STORED = 100;

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ChatMessage[];
  } catch {
    return [];
  }
}

function saveHistory(messages: ChatMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED)));
  } catch {
    // ignore quota errors
  }
}

export function ChatPage({ user, onLogout }: ChatPageProps) {
  const token = getAuthToken();
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory());
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

    const userMsg: ChatMessage = {
      role: "user",
      content: text.trim(),
      timestamp: new Date().toISOString()
    };
    const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    saveHistory(newMessages);
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
        timestamp: new Date().toISOString()
      };
      const updatedMessages = [...newMessages, assistantMsg];
      setMessages(updatedMessages);
      saveHistory(updatedMessages);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "送信に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  };

  return (
    <AppLayout
      onLogout={onLogout}
      subtitle="家計の相談と提案を、会話形式で整理します。"
      title="AI相談"
      user={user}
    >
      <section className="chat-shell">
        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="chat-welcome">
              <div className="chat-welcome__hero">
                <p className="eyebrow">AI Financial Guide</p>
                <h2 className="chat-welcome__title">{user.name}さんの家計を、会話で整える</h2>
                <p className="chat-welcome__copy">
                  今月の支出傾向、節約余地、目標ペースをまとめて見ながら短く相談できます。
                </p>
              </div>

              <div className="chat-hints">
                {HINTS.map((hint) => (
                  <button
                    className="chat-hint-btn"
                    key={hint}
                    onClick={() => void sendMessage(hint)}
                    type="button"
                  >
                    <span className="material-symbols-outlined">north_east</span>
                    <span>{hint}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="chat-toolbar">
              <div className="chat-toolbar__meta">
                <p className="eyebrow">Conversation</p>
                <p className="text-sm">{messages.length}件の相談履歴</p>
              </div>
              <button className="btn btn--ghost btn--sm" onClick={clearHistory} type="button">
                履歴を消去
              </button>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              className={`chat-bubble-wrap chat-bubble-wrap--${msg.role}`}
              key={idx}
            >
              <div className={`chat-bubble chat-bubble--${msg.role}`}>
                {msg.role === "assistant" ? (
                  <Markdown text={msg.content} />
                ) : (
                  <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{msg.content}</p>
                )}
              </div>
              <span className="chat-bubble__time">
                {msg.role === "assistant" ? "AI · " : ""}
                {formatDateTimeJP(msg.timestamp)}
              </span>
            </div>
          ))}

          {loading ? (
            <div className="chat-bubble-wrap chat-bubble-wrap--assistant">
              <div className="chat-loading">
                {[0, 1, 2].map((i) => (
                  <span className="chat-loading__dot" key={i} />
                ))}
              </div>
            </div>
          ) : null}

          {error ? <p className="chat-error">{error}</p> : null}

          <div ref={bottomRef} />
        </div>

        <div className="chat-input-bar">
          <div className="chat-input-bar__inner">
            <textarea
              ref={textareaRef}
              className="chat-input-bar__textarea"
              disabled={loading}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="今月の支出で気になる点を入力"
              rows={1}
              value={input}
            />
            <button
              aria-label="送信"
              className="btn btn--fill chat-input-bar__send"
              disabled={loading || !input.trim()}
              onClick={() => void sendMessage(input)}
              type="button"
            >
              <span className="material-symbols-outlined">send</span>
            </button>
          </div>
          <p className="chat-input-bar__hint">Shift+Enter で改行 / Enter で送信</p>
        </div>
      </section>
    </AppLayout>
  );
}
