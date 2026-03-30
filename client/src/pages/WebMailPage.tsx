import { useCallback, useEffect, useRef, useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { apiRequest } from "../lib/api";
import { getAuthToken } from "../lib/storage";
import { useToast } from "../lib/toast";
import type { AppUser } from "../lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type MailboxInfo = { isSetup: boolean; address: string | null; mailDomain: string };
type Counts = { inbox: number; starred: number; trash: number };
type Folder = "inbox" | "starred" | "trash";

type MsgSummary = {
  id: string;
  fromAddress: string;
  subject: string;
  receivedAt: string;
  isRead: boolean;
  isStarred: boolean;
  folder: string;
  preview: string;
  parseStatus: string;
  candidates: Array<{ id: string; status: string }>;
};

type MsgDetail = MsgSummary & {
  rawText: string | null;
  rawHtml: string | null;
  parsedJson: unknown;
  deletedAt: string | null;
};

type Script = { code: string; enabled: boolean };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function senderName(addr: string): string {
  const m = addr.match(/^"?([^"<]+?)"?\s*</);
  return m ? m[1].trim() : addr.replace(/@.*/, "");
}

function senderInitial(addr: string): string {
  return senderName(addr).charAt(0).toUpperCase() || "?";
}

const AVATAR_COLORS = [
  "#0f766e", "#0369a1", "#7c3aed", "#be123c",
  "#c2410c", "#15803d", "#1d4ed8", "#854d0e"
];

function avatarColor(addr: string): string {
  let h = 0;
  for (let i = 0; i < addr.length; i++) h = addr.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  const diffDays = (now.getTime() - d.getTime()) / 86400000;
  if (diffDays < 7) return d.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
  return d.toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric" });
}

const DEFAULT_SCRIPT = `// メール受信時に自動実行されるコードです。
// 利用可能な関数:
//   star()        - スターを付ける
//   moveToTrash() - ゴミ箱に移動
//   markAsRead()  - 既読にする
//
// email オブジェクト:
//   email.from    - 差出人アドレス
//   email.subject - 件名
//   email.body    - 本文（最初の1000文字）

// 例: 銀行からのメールにスターを付ける
// if (email.from.includes('smbc')) {
//   star();
// }
`;

// ─── Setup Wizard ─────────────────────────────────────────────────────────────

function SetupWizard({
  mailDomain,
  onDone
}: {
  mailDomain: string;
  onDone: (address: string) => void;
}) {
  const token = getAuthToken();
  const toast = useToast();
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isValid = /^[a-z0-9][a-z0-9_-]{5,29}$/.test(username);

  async function handleSetup() {
    if (!isValid) return;
    setSaving(true);
    setError("");
    try {
      const res = await apiRequest<{ address: string }>("/api/webmail/setup", {
        method: "POST",
        token,
        body: { username }
      });
      toast("メールアドレスを設定しました");
      onDone(res.address);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "エラーが発生しました";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="wm-setup-wrap">
      <div className="wm-setup-card">
        <div className="wm-setup-icon">
          <span className="material-symbols-outlined">mark_email_unread</span>
        </div>
        <h1 className="wm-setup-title">メールアドレスを設定</h1>
        <p className="wm-setup-desc">
          ためログ専用のメールアドレスを作成します。<br />
          銀行やカードの通知メールをここに転送すると、自動で家計簿の候補になります。
        </p>

        <div className="wm-setup-field">
          <div className="wm-setup-input-wrap">
            <input
              className="wm-setup-input"
              type="text"
              placeholder="ユーザー名（6文字以上）"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
              maxLength={30}
              onKeyDown={(e) => e.key === "Enter" && void handleSetup()}
              autoFocus
            />
            <span className="wm-setup-domain">@{mailDomain}</span>
          </div>
          <p className="wm-setup-hint">英小文字・数字・ハイフン・アンダースコア、6〜30文字</p>
          {error && <p className="wm-setup-error">{error}</p>}
        </div>

        <button
          className="btn btn--fill"
          disabled={!isValid || saving}
          onClick={() => void handleSetup()}
          type="button"
        >
          {saving ? "作成中..." : "メールアドレスを作成"}
        </button>
      </div>
    </div>
  );
}

// ─── Script Editor ────────────────────────────────────────────────────────────

function ScriptEditor({ onBack }: { onBack: () => void }) {
  const token = getAuthToken();
  const toast = useToast();
  const [script, setScript] = useState<Script>({ code: DEFAULT_SCRIPT, enabled: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiRequest<Script>("/api/webmail/script", { token });
        setScript({ code: res.code || DEFAULT_SCRIPT, enabled: res.enabled });
      } catch {
        /* keep defaults */
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      await apiRequest<Script>("/api/webmail/script", {
        method: "PUT",
        token,
        body: script
      });
      toast("スクリプトを保存しました");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "保存に失敗しました";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="wm-loading">読み込み中...</div>;

  return (
    <div className="wm-script-wrap">
      <div className="wm-script-header">
        <button className="btn btn--ghost btn--sm btn--icon" type="button" onClick={onBack}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="wm-script-title">受信スクリプト</h2>
        <label className="wm-script-toggle">
          <input
            type="checkbox"
            checked={script.enabled}
            onChange={(e) => setScript((s) => ({ ...s, enabled: e.target.checked }))}
          />
          <span>有効</span>
        </label>
      </div>

      <p className="wm-script-desc">
        メール受信時に自動実行されるJavaScriptコードです。<br />
        <code>star()</code> / <code>moveToTrash()</code> / <code>markAsRead()</code> を使って自動振り分けができます。
      </p>

      {error && <p className="wm-script-error">{error}</p>}

      <textarea
        className="wm-script-editor"
        value={script.code}
        onChange={(e) => setScript((s) => ({ ...s, code: e.target.value }))}
        rows={20}
        spellCheck={false}
      />

      <div className="wm-script-actions">
        <button className="btn btn--fill" type="button" onClick={() => void save()} disabled={saving}>
          {saving ? "保存中..." : "保存"}
        </button>
        <button className="btn btn--out" type="button" onClick={onBack}>
          戻る
        </button>
      </div>
    </div>
  );
}

// ─── Message Detail ───────────────────────────────────────────────────────────

function MsgDetailPane({
  msgId,
  onBack,
  onStar,
  onTrash,
  onRestore
}: {
  msgId: string;
  onBack: () => void;
  onStar: (id: string, val: boolean) => void;
  onTrash: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  const token = getAuthToken();
  const [msg, setMsg] = useState<MsgDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void (async () => {
      try {
        const res = await apiRequest<MsgDetail>(`/api/webmail/messages/${msgId}`, { token });
        setMsg(res as MsgDetail);
      } catch {
        setMsg(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [msgId, token]);

  if (loading) return <div className="wm-detail-loading"><div className="wm-spinner" /></div>;
  if (!msg) return <div className="wm-detail-empty">メールを読み込めませんでした</div>;

  const body = msg.rawText ?? "(本文なし)";
  const isInTrash = !!msg.deletedAt;

  return (
    <div className="wm-detail">
      <div className="wm-detail-toolbar">
        <button className="btn btn--ghost btn--sm btn--icon" type="button" onClick={onBack} title="戻る">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>

        <div className="wm-detail-toolbar__right">
          <button
            className={`btn btn--ghost btn--sm btn--icon${msg.isStarred ? " wm-star--on" : ""}`}
            type="button"
            title={msg.isStarred ? "スターを外す" : "スターを付ける"}
            onClick={() => { onStar(msg.id, !msg.isStarred); setMsg((m) => m ? { ...m, isStarred: !m.isStarred } : m); }}
          >
            <span className="material-symbols-outlined">{msg.isStarred ? "star" : "star_border"}</span>
          </button>

          {isInTrash ? (
            <button className="btn btn--ghost btn--sm btn--icon" type="button" title="受信箱に戻す" onClick={() => onRestore(msg.id)}>
              <span className="material-symbols-outlined">restore_from_trash</span>
            </button>
          ) : (
            <button className="btn btn--ghost btn--sm btn--icon" type="button" title="ゴミ箱に移動" onClick={() => onTrash(msg.id)}>
              <span className="material-symbols-outlined">delete</span>
            </button>
          )}
        </div>
      </div>

      <div className="wm-detail-header">
        <h2 className="wm-detail-subject">{msg.subject}</h2>
        <div className="wm-detail-meta">
          <div
            className="wm-avatar"
            style={{ background: avatarColor(msg.fromAddress) }}
          >
            {senderInitial(msg.fromAddress)}
          </div>
          <div className="wm-detail-meta__info">
            <p className="wm-detail-sender">{senderName(msg.fromAddress)}</p>
            <p className="wm-detail-from">{msg.fromAddress}</p>
          </div>
          <time className="wm-detail-date">{fmtDate(msg.receivedAt)}</time>
        </div>
      </div>

      {msg.candidates.length > 0 && (
        <div className="wm-detail-candidates">
          <span className="material-symbols-outlined">receipt_long</span>
          <span>家計簿の候補が {msg.candidates.length} 件あります</span>
          <a href="/inbox" className="wm-detail-candidates__link">候補を確認</a>
        </div>
      )}

      <div className="wm-detail-body">
        <pre className="wm-detail-body__text">{body}</pre>
      </div>
    </div>
  );
}

// ─── Message Row ──────────────────────────────────────────────────────────────

function MsgRow({
  msg,
  selected,
  onSelect,
  onStar,
  onTrash
}: {
  msg: MsgSummary;
  selected: boolean;
  onSelect: () => void;
  onStar: (id: string, val: boolean) => void;
  onTrash: (id: string) => void;
}) {
  return (
    <div
      className={`wm-row${selected ? " wm-row--selected" : ""}${msg.isRead ? "" : " wm-row--unread"}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
    >
      <div
        className="wm-avatar wm-avatar--sm"
        style={{ background: avatarColor(msg.fromAddress) }}
        onClick={(e) => e.stopPropagation()}
      >
        {senderInitial(msg.fromAddress)}
      </div>

      <div className="wm-row__body">
        <div className="wm-row__top">
          <span className="wm-row__sender">{senderName(msg.fromAddress)}</span>
          <time className="wm-row__date">{fmtDate(msg.receivedAt)}</time>
        </div>
        <p className="wm-row__subject">{msg.subject}</p>
        <p className="wm-row__preview">{msg.preview}</p>
      </div>

      <div className="wm-row__actions" onClick={(e) => e.stopPropagation()}>
        <button
          className={`wm-row__star${msg.isStarred ? " wm-star--on" : ""}`}
          type="button"
          title={msg.isStarred ? "スターを外す" : "スターを付ける"}
          onClick={(e) => { e.stopPropagation(); onStar(msg.id, !msg.isStarred); }}
        >
          <span className="material-symbols-outlined">{msg.isStarred ? "star" : "star_border"}</span>
        </button>
        <button
          className="wm-row__trash"
          type="button"
          title="ゴミ箱"
          onClick={(e) => { e.stopPropagation(); onTrash(msg.id); }}
        >
          <span className="material-symbols-outlined">delete</span>
        </button>
      </div>
    </div>
  );
}

// ─── Main WebMailPage ─────────────────────────────────────────────────────────

type Props = { user: AppUser; onLogout: () => Promise<void> };

export function WebMailPage({ user, onLogout }: Props) {
  const token = getAuthToken();
  const toast = useToast();

  const [mailbox, setMailbox] = useState<MailboxInfo | null>(null);
  const [counts, setCounts] = useState<Counts>({ inbox: 0, starred: 0, trash: 0 });
  const [folder, setFolder] = useState<Folder>("inbox");
  const [messages, setMessages] = useState<MsgSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [view, setView] = useState<"mail" | "script">("mail");
  const [copiedAddr, setCopiedAddr] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  // ── Load mailbox info ──
  useEffect(() => {
    void (async () => {
      try {
        const res = await apiRequest<MailboxInfo>("/api/webmail/me", { token });
        setMailbox(res as MailboxInfo);
      } catch {
        toast("メールボックスの読み込みに失敗しました", "err");
      }
    })();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load counts ──
  const loadCounts = useCallback(async () => {
    try {
      const res = await apiRequest<Counts>("/api/webmail/counts", { token });
      setCounts(res as Counts);
    } catch { /* ignore */ }
  }, [token]);

  // ── Load messages ──
  const loadMessages = useCallback(async (f: Folder) => {
    setLoadingMsgs(true);
    try {
      const q = f === "starred"
        ? `/api/webmail/messages?folder=inbox&limit=50`
        : `/api/webmail/messages?folder=${f}&limit=50`;
      // starred: filter client-side from inbox for simplicity
      // Actually let's do server-side: folder=starred means isStarred=true
      const url = f === "starred"
        ? `/api/webmail/messages?folder=inbox&limit=200`
        : `/api/webmail/messages?folder=${f}&limit=50`;
      const res = await apiRequest<{ messages: MsgSummary[]; total: number }>(url, { token });
      const msgs = res.messages ?? [];
      if (f === "starred") {
        const starred = msgs.filter((m) => m.isStarred);
        setMessages(starred);
        setTotal(starred.length);
      } else {
        setMessages(msgs);
        setTotal(res.total ?? 0);
      }
    } catch {
      toast("メールの読み込みに失敗しました", "err");
    } finally {
      setLoadingMsgs(false);
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mailbox?.isSetup) {
      void loadMessages(folder);
      void loadCounts();
    }
  }, [mailbox, folder]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ──
  function selectMsg(id: string) {
    setSelectedId(id);
    setMobileView("detail");
    // Mark as read locally
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, isRead: true } : m));
    setSidebarOpen(false);
    setTimeout(() => detailRef.current?.scrollTo(0, 0), 50);
  }

  async function handleStar(id: string, val: boolean) {
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, isStarred: val } : m));
    try {
      await apiRequest(`/api/webmail/messages/${id}`, {
        method: "PATCH", token, body: { isStarred: val }
      });
      void loadCounts();
    } catch {
      setMessages((prev) => prev.map((m) => m.id === id ? { ...m, isStarred: !val } : m));
    }
  }

  async function handleTrash(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    if (selectedId === id) { setSelectedId(null); setMobileView("list"); }
    try {
      await apiRequest(`/api/webmail/messages/${id}`, { method: "DELETE", token });
      toast("ゴミ箱に移動しました");
      void loadCounts();
    } catch {
      toast("削除に失敗しました", "err");
      void loadMessages(folder);
    }
  }

  async function handleRestore(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    if (selectedId === id) { setSelectedId(null); setMobileView("list"); }
    try {
      await apiRequest(`/api/webmail/messages/${id}`, {
        method: "PATCH", token, body: { folder: "inbox" }
      });
      toast("受信箱に戻しました");
      void loadCounts();
    } catch {
      toast("操作に失敗しました", "err");
    }
  }

  async function copyAddress() {
    if (!mailbox?.address) return;
    try {
      await navigator.clipboard.writeText(mailbox.address);
      setCopiedAddr(true);
      setTimeout(() => setCopiedAddr(false), 2000);
    } catch {
      toast("コピーに失敗しました", "err");
    }
  }

  function changeFolder(f: Folder) {
    setFolder(f);
    setSelectedId(null);
    setMobileView("list");
    setSidebarOpen(false);
  }

  const FOLDER_LABELS: Record<Folder, string> = {
    inbox: "受信箱",
    starred: "スター付き",
    trash: "ゴミ箱"
  };

  const FOLDER_ICONS: Record<Folder, string> = {
    inbox: "inbox",
    starred: "star",
    trash: "delete"
  };

  // ── Render: not loaded ──
  if (!mailbox) {
    return (
      <AppLayout onLogout={onLogout} title="メール" user={user}>
        <div className="wm-loading">読み込み中...</div>
      </AppLayout>
    );
  }

  // ── Render: setup needed ──
  if (!mailbox.isSetup) {
    return (
      <AppLayout onLogout={onLogout} title="メール" user={user}>
        <SetupWizard
          mailDomain={mailbox.mailDomain}
          onDone={(address) => setMailbox({ isSetup: true, address, mailDomain: mailbox.mailDomain })}
        />
      </AppLayout>
    );
  }

  // ── Render: script editor ──
  if (view === "script") {
    return (
      <AppLayout onLogout={onLogout} title="メール" user={user}>
        <ScriptEditor onBack={() => setView("mail")} />
      </AppLayout>
    );
  }

  // ── Sidebar ──
  const sidebar = (
    <div className={`wm-sidebar${sidebarOpen ? " wm-sidebar--open" : ""}`}>
      <div className="wm-sidebar__addr">
        <span className="material-symbols-outlined wm-sidebar__addr-icon">alternate_email</span>
        <div className="wm-sidebar__addr-text">
          <p className="wm-sidebar__addr-label">受信アドレス</p>
          <p className="wm-sidebar__addr-value">{mailbox.address}</p>
        </div>
        <button
          className="btn btn--ghost btn--icon btn--sm"
          type="button"
          onClick={() => void copyAddress()}
          title="コピー"
        >
          <span className="material-symbols-outlined">{copiedAddr ? "check" : "content_copy"}</span>
        </button>
      </div>

      <nav className="wm-sidebar__nav">
        {(["inbox", "starred", "trash"] as Folder[]).map((f) => (
          <button
            key={f}
            className={`wm-sidebar__item${folder === f ? " wm-sidebar__item--active" : ""}`}
            type="button"
            onClick={() => changeFolder(f)}
          >
            <span className="material-symbols-outlined">{FOLDER_ICONS[f]}</span>
            <span className="wm-sidebar__label">{FOLDER_LABELS[f]}</span>
            {f === "inbox" && counts.inbox > 0 && (
              <span className="wm-sidebar__badge">{counts.inbox}</span>
            )}
            {f === "starred" && counts.starred > 0 && (
              <span className="wm-sidebar__badge">{counts.starred}</span>
            )}
            {f === "trash" && counts.trash > 0 && (
              <span className="wm-sidebar__badge wm-sidebar__badge--muted">{counts.trash}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="wm-sidebar__divider" />

      <button
        className="wm-sidebar__item"
        type="button"
        onClick={() => { setView("script"); setSidebarOpen(false); }}
      >
        <span className="material-symbols-outlined">code</span>
        <span className="wm-sidebar__label">受信スクリプト</span>
      </button>
    </div>
  );

  // ── Message list ──
  const msgList = (
    <div className="wm-list">
      <div className="wm-list__header">
        <button
          className="btn btn--ghost btn--icon btn--sm wm-hamburger"
          type="button"
          onClick={() => setSidebarOpen((v) => !v)}
        >
          <span className="material-symbols-outlined">menu</span>
        </button>
        <h2 className="wm-list__title">{FOLDER_LABELS[folder]}</h2>
        <button
          className="btn btn--ghost btn--icon btn--sm"
          type="button"
          onClick={() => void loadMessages(folder)}
          title="更新"
        >
          <span className="material-symbols-outlined">refresh</span>
        </button>
      </div>

      {loadingMsgs && <div className="wm-list-loading"><div className="wm-spinner" /></div>}

      {!loadingMsgs && messages.length === 0 && (
        <div className="wm-empty">
          <span className="material-symbols-outlined">{FOLDER_ICONS[folder]}</span>
          <p>{FOLDER_LABELS[folder]}は空です</p>
        </div>
      )}

      {!loadingMsgs && messages.map((msg) => (
        <MsgRow
          key={msg.id}
          msg={msg}
          selected={selectedId === msg.id}
          onSelect={() => selectMsg(msg.id)}
          onStar={handleStar}
          onTrash={handleTrash}
        />
      ))}

      {!loadingMsgs && total > messages.length && (
        <p className="wm-list__more">+ {total - messages.length} 件以上</p>
      )}
    </div>
  );

  // ── Detail pane ──
  const detailPane = (
    <div className="wm-detail-wrap" ref={detailRef}>
      {selectedId ? (
        <MsgDetailPane
          msgId={selectedId}
          onBack={() => { setSelectedId(null); setMobileView("list"); }}
          onStar={handleStar}
          onTrash={handleTrash}
          onRestore={handleRestore}
        />
      ) : (
        <div className="wm-detail-empty">
          <span className="material-symbols-outlined">mail</span>
          <p>メールを選択してください</p>
        </div>
      )}
    </div>
  );

  // ── Overlay for mobile sidebar ──
  const overlay = sidebarOpen && (
    <div className="wm-overlay" onClick={() => setSidebarOpen(false)} />
  );

  return (
    <AppLayout onLogout={onLogout} title="メール" user={user}>
      <div className="wm-shell">
        {overlay}
        {sidebar}
        <div className="wm-content">
          {/* Desktop: always show both list + detail */}
          <div className="wm-panes">
            <div className={`wm-panes__list${mobileView === "detail" ? " wm-panes__list--hidden" : ""}`}>
              {msgList}
            </div>
            <div className={`wm-panes__detail${mobileView === "list" ? " wm-panes__detail--hidden" : ""}`}>
              {detailPane}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
