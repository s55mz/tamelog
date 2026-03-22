import { useEffect, useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { apiRequest } from "../lib/api";
import { useAutoRefresh } from "../lib/autoRefresh";
import { formatDate } from "../lib/format";
import { getAuthToken } from "../lib/storage";
import { useToast } from "../lib/toast";
import type { AppUser } from "../lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type MailMessage = {
  id: string;
  fromAddress: string;
  subject: string;
  receivedAt: string;
  parseStatus: string;
  rawText: string | null;
  candidates: Array<{
    id: string;
    status: string;
    candidateType: string;
    amount: number | null;
  }>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const parseStatusLabel: Record<string, string> = {
  RECEIVED: "受信済",
  PARSED: "解析済",
  DUPLICATE: "対象外",
  FAILED: "エラー"
};

const parseStatusClass: Record<string, string> = {
  RECEIVED: "inbox-badge--amber",
  PARSED: "inbox-badge--brand",
  DUPLICATE: "inbox-badge--muted",
  FAILED: "inbox-badge--info"
};

// ─── MailboxPage ──────────────────────────────────────────────────────────────

type MailboxPageProps = {
  user: AppUser;
  onLogout: () => Promise<void>;
};

export function MailboxPage({ user, onLogout }: MailboxPageProps) {
  const token = getAuthToken();
  const toast = useToast();

  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await apiRequest<{ messages: MailMessage[]; total: number }>(
        "/api/mailbox/messages?limit=50",
        { token }
      );
      setMessages(res.messages ?? []);
      setTotal(res.total ?? 0);
    } catch {
      toast("読み込みに失敗しました", "err");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);
  useAutoRefresh(load);

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  async function deleteMessage(id: string) {
    setDeletingId(id);
    try {
      await apiRequest(`/api/mailbox/messages/${id}`, { method: "DELETE", token });
      toast("削除しました");
      await load();
    } catch {
      toast("削除に失敗しました", "err");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <AppLayout onLogout={onLogout} title="受信メール" user={user}>
      <div className="mailbox-wrap">
        <div className="inbox-summary-bar">
          <p className="inbox-summary-bar__text">
            <span className="inbox-summary-bar__count">{total}</span>
            通のメールが届いています
          </p>
        </div>

        {loading && <p className="empty">読み込み中...</p>}

        {!loading && messages.length === 0 && (
          <div className="empty">
            <span className="material-symbols-outlined">mail</span>
            <p>受信メールはありません</p>
            <p className="empty__sub">転送アドレスにメールを送信すると表示されます</p>
          </div>
        )}

        {!loading && messages.length > 0 && (
          <div className="mailbox-list">
            {messages.map((msg) => (
              <div className="mailbox-item" key={msg.id}>
                <div className="mailbox-item__header">
                  <div className="mailbox-item__meta">
                    <span className={`inbox-badge ${parseStatusClass[msg.parseStatus] ?? "inbox-badge--muted"}`}>
                      {parseStatusLabel[msg.parseStatus] ?? msg.parseStatus}
                    </span>
                    {msg.candidates.length > 0 && (
                      <span className="inbox-badge inbox-badge--brand">候補あり</span>
                    )}
                  </div>
                  <div className="mailbox-item__actions">
                    <span className="mailbox-item__date">{formatDate(msg.receivedAt)}</span>
                    <button
                      className="btn btn--icon btn--sm btn--del"
                      disabled={deletingId === msg.id}
                      onClick={() => void deleteMessage(msg.id)}
                      type="button"
                      aria-label="削除"
                    >
                      <span className="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                </div>

                <p className="mailbox-item__subject">{msg.subject}</p>
                <p className="mailbox-item__from">{msg.fromAddress}</p>

                {msg.rawText && (
                  <button
                    className="inbox-mail-preview__toggle"
                    onClick={() => toggleExpand(msg.id)}
                    type="button"
                  >
                    <span className="material-symbols-outlined">
                      {expandedId === msg.id ? "expand_less" : "expand_more"}
                    </span>
                    本文を{expandedId === msg.id ? "閉じる" : "表示"}
                  </button>
                )}

                {expandedId === msg.id && msg.rawText && (
                  <pre className="inbox-mail-preview__body">{msg.rawText}</pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
