import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { AppLayout } from "../components/AppLayout";
import { Markdown } from "../components/Markdown";
import { apiRequest } from "../lib/api";
import { formatDateTimeJP } from "../lib/format";
import { getAuthToken } from "../lib/storage";
import { useToast } from "../lib/toast";
import type { AppUser } from "../lib/types";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  imagePreview?: string;
};

type OcrResult = {
  amount: number | null;
  date: string | null;
  time: string | null;
  vendor: string | null;
  type: "INCOME" | "EXPENSE";
  categoryId: string | null;
  missingFields: string[];
};

type Account = { id: string; name: string; type: string; balance: number };
type Category = { id: string; name: string; type: string };
type Goal = { id: string; title: string };

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
    // ignore
  }
}

async function optimizeImage(file: File): Promise<{ imageBase64: string; mimeType: string; previewUrl: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = dataUrl;
  });
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  const previewUrl = canvas.toDataURL("image/jpeg", 0.84);
  return { imageBase64: previewUrl.split(",")[1] ?? "", mimeType: "image/jpeg", previewUrl };
}

// OCR確認カード（チャット内でインライン表示）
function OcrConfirmCard({
  result, accounts, categories, goals,
  onConfirm, onDismiss
}: {
  result: OcrResult;
  accounts: Account[];
  categories: Category[];
  goals: Goal[];
  onConfirm: (data: {
    accountId: string; amount: number; type: "INCOME" | "EXPENSE";
    categoryId: string; memo: string; date: string;
  }) => void;
  onDismiss: () => void;
}) {
  const filteredCategories = categories.filter((c) => c.type === result.type);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState(result.amount ?? 0);
  const [memo, setMemo] = useState(result.vendor ?? "");
  const [categoryId, setCategoryId] = useState(result.categoryId ?? "");
  const [date, setDate] = useState(result.date ?? new Date().toISOString().slice(0, 10));

  return (
    <div className="card form-stack" style={{ border: "1.5px solid var(--brand)", marginTop: "var(--s2)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--s2)", marginBottom: "var(--s1)" }}>
        <span className="material-symbols-outlined" style={{ fontSize: "18px", color: "var(--brand)", flexShrink: 0 }}>receipt_long</span>
        <p style={{ fontWeight: 700, fontSize: "14px" }}>読み取り結果を確認</p>
      </div>

      {result.missingFields.length > 0 ? (
        <p style={{ fontSize: "12px", color: "var(--coral)", background: "var(--danger-soft)", padding: "6px 10px", borderRadius: "8px" }}>
          読み取れなかった項目: {result.missingFields.map((f) => f === "amount" ? "金額" : f === "date" ? "日付" : "取引先").join(" / ")}
        </p>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s2)" }}>
        <label className="field">
          <span className="field__label">金額</span>
          <input
            type="number" value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            style={{ fontWeight: 700 }}
          />
        </label>
        <label className="field">
          <span className="field__label">日付</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      <label className="field">
        <span className="field__label">取引先・メモ</span>
        <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="店名・メモ（任意）" />
      </label>

      <label className="field">
        <span className="field__label">口座</span>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} (¥{a.balance.toLocaleString()})</option>)}
        </select>
      </label>

      {filteredCategories.length > 0 ? (
        <div>
          <p className="field__label" style={{ marginBottom: "var(--s1)" }}>カテゴリ</p>
          <div className="chip-group">
            <button className={`chip${categoryId === "" ? " on" : ""}`} onClick={() => setCategoryId("")} type="button">なし</button>
            {filteredCategories.map((cat) => (
              <button className={`chip${categoryId === cat.id ? " on" : ""}`} key={cat.id} onClick={() => setCategoryId(cat.id)} type="button">
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: "var(--s2)" }}>
        <button
          className="btn btn--fill"
          style={{ flex: 1, background: result.type === "EXPENSE" ? "var(--coral)" : "var(--jade)", borderColor: result.type === "EXPENSE" ? "var(--coral)" : "var(--jade)" }}
          onClick={() => onConfirm({ accountId, amount, type: result.type, categoryId, memo, date })}
          disabled={!amount || !accountId}
          type="button"
        >
          {result.type === "EXPENSE" ? "支出" : "収入"}として保存
        </button>
        <button className="btn btn--ghost" onClick={onDismiss} type="button" style={{ color: "var(--text-3)", fontSize: "13px" }}>
          キャンセル
        </button>
      </div>
    </div>
  );
}

export function ChatPage({ user, onLogout }: ChatPageProps) {
  const token = getAuthToken();
  const toast = useToast();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory());
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingOcr, setPendingOcr] = useState<{ result: OcrResult; msgIndex: number } | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // マスターデータ読み込み
  useEffect(() => {
    if (!token) return;
    void Promise.all([
      apiRequest<{ accounts: Account[] }>("/api/accounts", { token }),
      apiRequest<{ categories: Category[] }>("/api/categories", { token }),
      apiRequest<{ goals: Goal[] }>("/api/goals", { token })
    ]).then(([a, c, g]) => {
      setAccounts(a.accounts);
      setCategories(c.categories);
      setGoals(g.goals);
    });
  }, [token]);

  // 初回: 財務概要をAIメッセージとして表示
  useEffect(() => {
    if (!token || messages.length > 0) return;
    setContextLoading(true);
    void apiRequest<{ greeting: string }>("/api/chat/context", { token })
      .then((data) => {
        const msg: ChatMessage = {
          role: "assistant",
          content: data.greeting,
          timestamp: new Date().toISOString()
        };
        setMessages([msg]);
        saveHistory([msg]);
      })
      .catch(() => {
        // 失敗しても画面は表示する
      })
      .finally(() => setContextLoading(false));
  }, [token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingOcr]);

  const sendMessage = async (text: string, imageBase64?: string, mimeType?: string, previewUrl?: string) => {
    if (!token || (!text.trim() && !imageBase64) || loading) return;
    setError("");

    const userMsg: ChatMessage = {
      role: "user",
      content: text.trim() || "（画像を添付）",
      timestamp: new Date().toISOString(),
      imagePreview: previewUrl
    };
    const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    saveHistory(newMessages);
    setInput("");
    setLoading(true);

    try {
      const body: Record<string, unknown> = { message: text.trim() || "画像を読み取ってください", history };
      if (imageBase64 && mimeType) {
        body.imageBase64 = imageBase64;
        body.mimeType = mimeType;
      }

      const data = await apiRequest<{ reply: string; ocrResult?: OcrResult }>("/api/chat", {
        method: "POST", token, body
      });

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: data.reply,
        timestamp: new Date().toISOString()
      };
      const updatedMessages = [...newMessages, assistantMsg];
      setMessages(updatedMessages);
      saveHistory(updatedMessages);

      // OCR結果があれば確認カードを表示
      if (data.ocrResult) {
        setPendingOcr({ result: data.ocrResult, msgIndex: updatedMessages.length - 1 });
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "送信に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    e.target.value = "";
    try {
      const optimized = await optimizeImage(file);
      await sendMessage("", optimized.imageBase64, optimized.mimeType, optimized.previewUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "画像の準備に失敗しました");
    }
  };

  const handleOcrConfirm = async (data: {
    accountId: string; amount: number; type: "INCOME" | "EXPENSE";
    categoryId: string; memo: string; date: string;
  }) => {
    if (!token) return;
    try {
      await apiRequest("/api/records", {
        method: "POST", token,
        body: {
          type: data.type,
          accountId: data.accountId,
          categoryId: data.categoryId || null,
          amount: data.amount,
          memo: data.memo || null,
          recordDate: data.date,
          recordedAt: new Date().toISOString(),
          emotions: []
        }
      });
      toast("記録しました");
      setPendingOcr(null);

      const confirmMsg: ChatMessage = {
        role: "assistant",
        content: `記録しました！${data.type === "EXPENSE" ? "支出" : "収入"} ¥${data.amount.toLocaleString()}${data.memo ? `（${data.memo}）` : ""}を${data.date}として保存しました。`,
        timestamp: new Date().toISOString()
      };
      const updated = [...messages, confirmMsg];
      setMessages(updated);
      saveHistory(updated);
    } catch (err) {
      toast(err instanceof Error ? err.message : "保存に失敗しました", "err");
    }
  };

  const clearHistory = () => {
    setMessages([]);
    setPendingOcr(null);
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
      subtitle="家計の相談・記録・振り返りを会話形式で。"
      title="AI相談"
      user={user}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => void handleFileChange(e)}
      />

      <section className="chat-shell">
        <div className="chat-messages">
          {messages.length === 0 && !contextLoading ? (
            <div className="chat-welcome">
              <div className="chat-welcome__hero">
                <p className="eyebrow">AI Financial Guide</p>
                <h2 className="chat-welcome__title">{user.name}さんの家計を、会話で整える</h2>
                <p className="chat-welcome__copy">
                  今月の収支確認、節約アドバイス、レシート読み取りによる記録登録ができます。
                </p>
              </div>
              <div className="chat-hints">
                {HINTS.map((hint) => (
                  <button className="chat-hint-btn" key={hint} onClick={() => void sendMessage(hint)} type="button">
                    <span className="material-symbols-outlined">north_east</span>
                    <span>{hint}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {contextLoading ? (
            <div className="chat-bubble-wrap chat-bubble-wrap--assistant">
              <div className="chat-loading">
                {[0, 1, 2].map((i) => <span className="chat-loading__dot" key={i} />)}
              </div>
            </div>
          ) : null}

          {messages.length > 0 ? (
            <div className="chat-toolbar">
              <div className="chat-toolbar__meta">
                <p className="eyebrow">Conversation</p>
                <p className="text-sm">{messages.length}件の履歴</p>
              </div>
              <div style={{ display: "flex", gap: "var(--s2)", alignItems: "center" }}>
                <button className="btn btn--ghost btn--sm" onClick={() => navigate("/record")} type="button" style={{ fontSize: "12px" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>add_circle</span>
                  手動記録
                </button>
                <button className="btn btn--ghost btn--sm" onClick={clearHistory} type="button">
                  履歴を消去
                </button>
              </div>
            </div>
          ) : null}

          {messages.map((msg, idx) => (
            <div className={`chat-bubble-wrap chat-bubble-wrap--${msg.role}`} key={idx}>
              {msg.imagePreview ? (
                <div className="chat-img-preview">
                  <img src={msg.imagePreview} alt="添付画像" />
                </div>
              ) : null}
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

              {/* OCR確認カードをAIメッセージの直下に表示（全幅） */}
              {pendingOcr && pendingOcr.msgIndex === idx && accounts.length > 0 ? (
                <div className="chat-ocr-card">
                  <OcrConfirmCard
                    result={pendingOcr.result}
                    accounts={accounts}
                    categories={categories}
                    goals={goals}
                    onConfirm={(data) => void handleOcrConfirm(data)}
                    onDismiss={() => setPendingOcr(null)}
                  />
                </div>
              ) : null}
            </div>
          ))}

          {loading ? (
            <div className="chat-bubble-wrap chat-bubble-wrap--assistant">
              <div className="chat-loading">
                {[0, 1, 2].map((i) => <span className="chat-loading__dot" key={i} />)}
              </div>
            </div>
          ) : null}

          {error ? <p className="chat-error">{error}</p> : null}
          <div ref={bottomRef} />
        </div>

        <div className="chat-input-bar">
          <div className="chat-input-bar__inner">
            <button
              type="button"
              aria-label="画像を添付"
              className="chat-input-bar__attach"
              disabled={loading}
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="material-symbols-outlined">add_photo_alternate</span>
            </button>
            <textarea
              ref={textareaRef}
              className="chat-input-bar__textarea"
              disabled={loading}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="メッセージを入力、またはレシート画像を添付"
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
          <p className="chat-input-bar__hint">
            <span className="material-symbols-outlined">add_photo_alternate</span>
            レシート添付で自動読み取り・Shift+Enter で改行
          </p>
        </div>
      </section>
    </AppLayout>
  );
}
