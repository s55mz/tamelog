import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { AppLayout } from "../components/AppLayout";
import { apiRequest } from "../lib/api";
import { useAutoRefresh } from "../lib/autoRefresh";
import { formatCurrency, formatDate } from "../lib/format";
import { getAuthToken } from "../lib/storage";
import { useToast } from "../lib/toast";
import type { AppUser } from "../lib/types";

const LAST_ACCOUNT_KEY = "tamelog_last_account_id";

// ─── Types ────────────────────────────────────────────────────────────────────

type Candidate = {
  id: string;
  sourceType: "MAIL" | "VPN" | "OCR" | "MANUAL";
  candidateType: "EXPENSE" | "INCOME" | "TRANSFER" | "SAVING" | "IMPULSE" | "EVENT";
  status: "PENDING" | "NEEDS_INPUT" | "DEFERRED" | "CONFIRMED" | "IGNORED" | "EXPIRED";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  occurredAt: string;
  amount: number | null;
  title: string;
  merchantRaw: string | null;
  merchantNormalized: string | null;
  memoDraft: string | null;
  needsUserInput: boolean;
  aiSummary: string | null;
  aiExtractedJson: {
    amount: number | null;
    candidateType: string;
    title: string;
    merchant: string | null;
    memo: string | null;
    confidence: string;
    needsUserInput: boolean;
    categoryName: string | null;
    comment: string | null;
  } | null;
  category: { id: string; name: string } | null;
  account: { id: string; name: string } | null;
  inboxMessage: {
    id: string;
    subject: string;
    fromAddress: string;
    rawText: string | null;
    receivedAt: string;
  } | null;
};

type RecentConfirmed = {
  id: string;
  title: string;
  amount: number | null;
  updatedAt: string;
  candidateType: string;
};

type InboxData = {
  candidates: Candidate[];
  summary: {
    pendingCount: number;
    deferredCount: number;
    recentConfirmed: RecentConfirmed[];
  };
};

type Account = {
  id: string;
  name: string;
  type: string;
};

type Category = {
  id: string;
  name: string;
  type: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sourceLabel: Record<string, string> = {
  MAIL: "メール",
  VPN: "VPN",
  OCR: "OCR",
  MANUAL: "手動"
};

const sourceIcon: Record<string, string> = {
  MAIL: "mail",
  VPN: "vpn_key",
  OCR: "document_scanner",
  MANUAL: "edit"
};

const confidenceLabel: Record<string, string> = {
  HIGH: "高信頼",
  MEDIUM: "要確認",
  LOW: "低信頼"
};

const confidenceClass: Record<string, string> = {
  HIGH: "inbox-badge--brand",
  MEDIUM: "inbox-badge--amber",
  LOW: "inbox-badge--info"
};

// ─── CandidateCard ─────────────────────────────────────────────────────────────

function CandidateCard({
  candidate,
  onConfirmQuick,
  onDefer,
  onIgnore,
  onOpenDetail
}: {
  candidate: Candidate;
  onConfirmQuick: (id: string) => void;
  onDefer: (id: string) => void;
  onIgnore: (id: string) => void;
  onOpenDetail: (c: Candidate) => void;
}) {
  const [mailExpanded, setMailExpanded] = useState(false);
  const isVpn = candidate.sourceType === "VPN";
  const isMail = candidate.sourceType === "MAIL";
  const isDeferred = candidate.status === "DEFERRED";

  return (
    <div className="inbox-card">
      <div className="inbox-card__header">
        <span className="inbox-source-badge">
          <span className="material-symbols-outlined">{sourceIcon[candidate.sourceType]}</span>
          {sourceLabel[candidate.sourceType]}
        </span>
        <span className={`inbox-badge ${confidenceClass[candidate.confidence]}`}>
          {confidenceLabel[candidate.confidence]}
        </span>
        {candidate.needsUserInput && (
          <span className="inbox-badge inbox-badge--amber">要入力</span>
        )}
        {isDeferred && (
          <span className="inbox-badge inbox-badge--muted">保留中</span>
        )}
      </div>

      <div className="inbox-card__body">
        <p className="inbox-card__title">{candidate.title}</p>
        {candidate.merchantRaw && (
          <p className="inbox-card__meta">{candidate.merchantRaw}</p>
        )}
        <p className="inbox-card__time">{formatDate(candidate.occurredAt)}</p>
        {candidate.amount != null && (
          <p className="inbox-card__amount">{formatCurrency(candidate.amount)}</p>
        )}
        {candidate.amount == null && (
          <p className="inbox-card__amount-unknown">金額未定</p>
        )}
        {candidate.category && (
          <p className="inbox-card__meta">{candidate.category.name}</p>
        )}
        {candidate.aiSummary && (
          <p className="inbox-card__ai-comment">{candidate.aiSummary}</p>
        )}
      </div>

      {/* メール送信元情報 */}
      {isMail && candidate.inboxMessage && (
        <div className="inbox-mail-meta">
          <span className="inbox-mail-meta__row">
            <span className="material-symbols-outlined">person</span>
            {candidate.inboxMessage.fromAddress}
          </span>
          <span className="inbox-mail-meta__row">
            <span className="material-symbols-outlined">subject</span>
            {candidate.inboxMessage.subject}
          </span>
          <span className="inbox-mail-meta__row">
            <span className="material-symbols-outlined">schedule</span>
            {formatDate(candidate.inboxMessage.receivedAt)}
          </span>
        </div>
      )}

      {/* メール本文プレビュー */}
      {isMail && candidate.inboxMessage?.rawText && (
        <div className="inbox-mail-preview">
          <button
            className="inbox-mail-preview__toggle"
            onClick={() => setMailExpanded((v) => !v)}
            type="button"
          >
            <span className="material-symbols-outlined">
              {mailExpanded ? "expand_less" : "expand_more"}
            </span>
            メール本文
          </button>
          {mailExpanded && (
            <pre className="inbox-mail-preview__body">{candidate.inboxMessage.rawText}</pre>
          )}
        </div>
      )}

      <div className="inbox-card__actions">
        {isVpn ? (
          <>
            <button className="btn btn--fill btn--sm" onClick={() => onOpenDetail(candidate)} type="button">
              買った
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => onDefer(candidate.id)} type="button">
              保留
            </button>
            <button className="btn btn--del btn--sm" onClick={() => onIgnore(candidate.id)} type="button">
              無視
            </button>
          </>
        ) : candidate.needsUserInput ? (
          <>
            <button className="btn btn--fill btn--sm" onClick={() => onOpenDetail(candidate)} type="button">
              確定する
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => onDefer(candidate.id)} type="button">
              あとで
            </button>
            <button className="btn btn--del btn--sm" onClick={() => onIgnore(candidate.id)} type="button">
              無視
            </button>
          </>
        ) : (
          <>
            <button className="btn btn--fill btn--sm" onClick={() => onConfirmQuick(candidate.id)} type="button">
              確定
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => onOpenDetail(candidate)} type="button">
              詳細
            </button>
            <button className="btn btn--del btn--sm" onClick={() => onIgnore(candidate.id)} type="button">
              無視
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── ReviewSheet ───────────────────────────────────────────────────────────────

function ReviewSheet({
  candidate,
  accounts,
  categories,
  onClose,
  onConfirmed
}: {
  candidate: Candidate;
  accounts: Account[];
  categories: Category[];
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const token = getAuthToken();
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);

  const isVpn = candidate.sourceType === "VPN";
  const defaultRecordType = candidate.candidateType === "INCOME" ? "INCOME" : "EXPENSE";
  const expenseCategories = categories.filter((c) => c.type === "EXPENSE");

  // AI 提案カテゴリを名前で検索して自動補完（種別フィルタ + 部分一致）
  const aiCategoryName = candidate.aiExtractedJson?.categoryName ?? null;
  const typeForCategory = defaultRecordType === "INCOME" ? "INCOME" : "EXPENSE";
  const typedCategories = categories.filter((c) => c.type === typeForCategory);
  const aiMatchedCategory = aiCategoryName
    ? (typedCategories.find((c) => c.name === aiCategoryName)
        ?? typedCategories.find((c) => c.name.includes(aiCategoryName) || aiCategoryName.includes(c.name))
        ?? null)
    : null;
  const defaultCategoryId = candidate.category?.id ?? aiMatchedCategory?.id ?? "";
  const defaultMemo = candidate.memoDraft ?? candidate.merchantRaw ?? "";

  // 前回使用した口座を優先
  const lastAccountId = localStorage.getItem(LAST_ACCOUNT_KEY) ?? "";
  const defaultAccountId =
    accounts.find((a) => a.id === lastAccountId)?.id ?? accounts[0]?.id ?? "";

  const [amount, setAmount] = useState(candidate.amount?.toString() ?? "");
  const [recordType, setRecordType] = useState<"INCOME" | "EXPENSE" | "SAVING">(defaultRecordType as any);
  const [accountId, setAccountId] = useState(defaultAccountId);
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [memo, setMemo] = useState(defaultMemo);
  const [recordDate, setRecordDate] = useState(candidate.occurredAt ? candidate.occurredAt.slice(0, 10) : today);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    const amountNum = parseInt(amount, 10);
    if (!amountNum || amountNum <= 0) {
      toast("金額を入力してください", "err");
      return;
    }
    if (!accountId) {
      toast("口座を選択してください", "err");
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest(`/api/candidates/${candidate.id}/confirm`, {
        method: "POST",
        token,
        body: { recordType, amount: amountNum, accountId, categoryId: categoryId || null, memo: memo || null, recordDate }
      });
      localStorage.setItem(LAST_ACCOUNT_KEY, accountId);
      toast("確定しました", "ok");
      onConfirmed();
    } catch {
      toast("確定に失敗しました", "err");
    } finally {
      setSubmitting(false);
    }
  }

  const visibleCategories = recordType === "INCOME"
    ? categories.filter((c) => c.type === "INCOME")
    : expenseCategories;

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <p className="sheet-title">候補を確認</p>
          <button className="btn btn--ghost btn--sm" onClick={onClose} type="button">閉じる</button>
        </div>

        <div className="sheet-body">
          <div className="inbox-review-source">
            <span className="material-symbols-outlined">{sourceIcon[candidate.sourceType]}</span>
            <span>{sourceLabel[candidate.sourceType]}</span>
            <span className="inbox-review-title">{candidate.title}</span>
          </div>

          {!isVpn && (
            <div className="form-stack">
              <div className="field">
                <label className="field__label">種別</label>
                <div className="seg">
                  {(["EXPENSE", "INCOME", "SAVING"] as const).map((t) => (
                    <button
                      key={t}
                      className={`seg__btn${recordType === t ? " on" : ""}`}
                      onClick={() => setRecordType(t)}
                      type="button"
                    >
                      {t === "EXPENSE" ? "支出" : t === "INCOME" ? "収入" : "貯金"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="form-stack">
            <div className="field">
              <label className="field__label">金額</label>
              <input
                className="field__input"
                inputMode="numeric"
                min="1"
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                type="number"
                value={amount}
              />
            </div>

            <div className="field">
              <label className="field__label">口座</label>
              <select className="field__select" onChange={(e) => setAccountId(e.target.value)} value={accountId}>
                <option value="">選択してください</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            {visibleCategories.length > 0 && (
              <div className="field">
                <label className="field__label">カテゴリ</label>
                <select className="field__select" onChange={(e) => setCategoryId(e.target.value)} value={categoryId}>
                  <option value="">未設定</option>
                  {visibleCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="field">
              <label className="field__label">日付</label>
              <input
                className="field__input"
                onChange={(e) => setRecordDate(e.target.value)}
                type="date"
                value={recordDate}
              />
            </div>

            <div className="field">
              <label className="field__label">メモ（任意）</label>
              <input
                className="field__input"
                maxLength={200}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="メモ"
                type="text"
                value={memo}
              />
            </div>
          </div>
        </div>

        <div className="sheet-footer">
          <button
            className="btn btn--fill btn--block"
            disabled={submitting}
            onClick={() => void handleConfirm()}
            type="button"
          >
            {submitting ? "確定中..." : "この内容で確定"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── InboxPage ─────────────────────────────────────────────────────────────────

type InboxPageProps = {
  user: AppUser;
  onLogout: () => Promise<void>;
};

export function InboxPage({ user, onLogout }: InboxPageProps) {
  const token = getAuthToken();
  const toast = useToast();

  const [data, setData] = useState<InboxData | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewCandidate, setReviewCandidate] = useState<Candidate | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [inboxRes, accountsRes, catsRes] = await Promise.all([
        apiRequest<InboxData>("/api/candidates", { token }),
        apiRequest<{ accounts: Account[] }>("/api/accounts", { token }),
        apiRequest<{ categories: Category[] }>("/api/categories", { token })
      ]);
      setData(inboxRes);
      setAccounts(accountsRes.accounts ?? []);
      setCategories(catsRes.categories ?? []);
    } catch {
      toast("読み込みに失敗しました", "err");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useAutoRefresh(load);

  async function handleConfirmQuick(id: string) {
    const candidate = data?.candidates.find((c) => c.id === id);
    if (!candidate) return;
    if (candidate.amount == null) {
      setReviewCandidate(candidate);
      return;
    }

    // 口座が必要なので ReviewSheet を開く
    setReviewCandidate(candidate);
  }

  async function handleDefer(id: string) {
    try {
      await apiRequest(`/api/candidates/${id}/defer`, {
        method: "POST",
        token,
        body: { deferredUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }
      });
      toast("24時間保留にしました", "ok");
      void load();
    } catch {
      toast("操作に失敗しました", "err");
    }
  }

  async function handleIgnore(id: string) {
    try {
      await apiRequest(`/api/candidates/${id}/ignore`, {
        method: "POST",
        token,
        body: {}
      });
      toast("無視しました", "ok");
      void load();
    } catch {
      toast("操作に失敗しました", "err");
    }
  }

  const pending = data?.candidates.filter((c) => c.status === "PENDING" || c.status === "NEEDS_INPUT") ?? [];
  const deferred = data?.candidates.filter((c) => c.status === "DEFERRED") ?? [];
  const recentConfirmed = data?.summary.recentConfirmed ?? [];
  const pendingCount = data?.summary.pendingCount ?? 0;

  return (
    <AppLayout onLogout={onLogout} title="候補インボックス" user={user}>
      {reviewCandidate && (
        <ReviewSheet
          accounts={accounts}
          candidate={reviewCandidate}
          categories={categories}
          onClose={() => setReviewCandidate(null)}
          onConfirmed={() => {
            setReviewCandidate(null);
            void load();
          }}
        />
      )}

      <div className="inbox-wrap">
        <div className="inbox-summary-bar">
          {pendingCount > 0 ? (
            <p className="inbox-summary-bar__text">
              <span className="inbox-summary-bar__count">{pendingCount}</span>
              件の未整理があります
            </p>
          ) : (
            <p className="inbox-summary-bar__text inbox-summary-bar__text--clear">
              <span className="material-symbols-outlined">check_circle</span>
              未整理はありません
            </p>
          )}
        </div>

        {loading && <p className="empty">読み込み中...</p>}

        {!loading && (
          <>
            {pending.length > 0 && (
              <section className="inbox-section">
                <h2 className="inbox-section__heading">要確認</h2>
                <div className="inbox-card-list">
                  {pending.map((c) => (
                    <CandidateCard
                      candidate={c}
                      key={c.id}
                      onConfirmQuick={handleConfirmQuick}
                      onDefer={handleDefer}
                      onIgnore={handleIgnore}
                      onOpenDetail={setReviewCandidate}
                    />
                  ))}
                </div>
              </section>
            )}

            {deferred.length > 0 && (
              <section className="inbox-section">
                <h2 className="inbox-section__heading">保留中</h2>
                <div className="inbox-card-list">
                  {deferred.map((c) => (
                    <CandidateCard
                      candidate={c}
                      key={c.id}
                      onConfirmQuick={handleConfirmQuick}
                      onDefer={handleDefer}
                      onIgnore={handleIgnore}
                      onOpenDetail={setReviewCandidate}
                    />
                  ))}
                </div>
              </section>
            )}

            {recentConfirmed.length > 0 && (
              <section className="inbox-section">
                <h2 className="inbox-section__heading">最近確定</h2>
                <div className="inbox-confirmed-list">
                  {recentConfirmed.map((r) => (
                    <div className="inbox-confirmed-item" key={r.id}>
                      <span className="material-symbols-outlined inbox-confirmed-item__icon">check_circle</span>
                      <span className="inbox-confirmed-item__title">{r.title}</span>
                      {r.amount != null && (
                        <span className="inbox-confirmed-item__amount">{formatCurrency(r.amount)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {pending.length === 0 && deferred.length === 0 && recentConfirmed.length === 0 && (
              <div className="empty">
                <span className="material-symbols-outlined">inbox</span>
                <p>候補はありません</p>
                <p className="empty__sub">メール転送や VPN 接続で候補が届きます</p>
              </div>
            )}
          </>
        )}

        <div className="inbox-footer-hint">
          <Link className="inbox-footer-link" to="/settings">
            <span className="material-symbols-outlined">mail</span>
            メール受信設定を確認
          </Link>
        </div>
      </div>
    </AppLayout>
  );
}
