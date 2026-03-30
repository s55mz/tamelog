import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Eye, EyeOff, Inbox, TrendingUp, Flag, MessageCircle, SquarePen,
  Wallet, ChevronRight, Sparkles,
} from "lucide-react";

import { AppLayout } from "../components/AppLayout";
import { apiRequest } from "../lib/api";
import { useAutoRefresh } from "../lib/autoRefresh";
import { formatCurrency, formatDate } from "../lib/format";
import { getAuthToken } from "../lib/storage";
import type { AppUser } from "../lib/types";
import { cn } from "../lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type DashboardData = {
  greeting: string;
  focusedGoal: null | {
    title: string;
    currentAmount: number;
    targetAmount: number;
    remainingAmount: number;
    achievementRate: number;
    remainingDays: number | null;
    visual: {
      headlineText: string;
      step: number;
      imagePath: string;
      altText: string;
    };
  };
  savingSummary: {
    currentPeriodId: string;
    savingTotal: number;
    incomeTotal: number;
    expenseTotal: number;
  };
  mission: {
    message: string;
  };
  recentRecords: Array<{
    id: string;
    type: string;
    amount: number;
    recordDate: string;
    memo: string | null;
  }>;
  pendingCandidateCount: number;
  todayRecordCount: number;
};

type Account = {
  id: string;
  name: string;
  type: string;
  balance: number;
  isPrimary?: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const typeLabel: Record<string, string> = {
  INCOME: "収入", EXPENSE: "支出", SAVING: "貯金",
  TRANSFER: "移動", SAVING_MOVE: "貯金移動",
};
const typeBadge: Record<string, string> = {
  INCOME: "badge--in", EXPENSE: "badge--out",
  SAVING: "badge--save", SAVING_MOVE: "badge--save",
  TRANSFER: "badge--move",
};
const amountClass: Record<string, string> = {
  INCOME:      "home-record-item__amount--positive",
  EXPENSE:     "home-record-item__amount--negative",
  SAVING:      "home-record-item__amount--neutral",
  SAVING_MOVE: "home-record-item__amount--neutral",
  TRANSFER:    "home-record-item__amount--neutral",
};
const accountTypeLabel: Record<string, string> = {
  BANK: "銀行", CASH: "現金", CREDIT: "クレカ",
};

// ─── Sub-components ────────────────────────────────────────────────────────────

function QuickAction({
  to, icon: Icon, label, color,
}: {
  to: string;
  icon: React.ElementType;
  label: string;
  color?: string;
}) {
  return (
    <Link to={to} className="dash-actions__btn">
      <span
        className="dash-actions__icon"
        style={color ? { color } : undefined}
      >
        <Icon size={20} strokeWidth={1.8} />
      </span>
      <span className="dash-actions__label">{label}</span>
    </Link>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type DashboardPageProps = {
  user: AppUser;
  onLogout: () => Promise<void>;
};

export function DashboardPage({ user, onLogout }: DashboardPageProps) {
  const token = getAuthToken();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [balanceVisible, setBalanceVisible] = useState(true);

  function load() {
    if (!token) return;
    void Promise.all([
      apiRequest<DashboardData>("/api/dashboard", { token }),
      apiRequest<{ accounts: Account[] }>("/api/accounts", { token }),
    ]).then(([dashData, accData]) => {
      setData(dashData);
      setAccounts(accData.accounts);
    });
  }

  useEffect(() => { load(); }, [token]);
  useAutoRefresh(load);

  const totalBalance = useMemo(
    () => accounts.reduce((s, a) => s + a.balance, 0),
    [accounts],
  );
  const goal = data?.focusedGoal ?? null;
  const pendingCount = data?.pendingCandidateCount ?? 0;
  const incomeTotal = data?.savingSummary.incomeTotal ?? 0;
  const expenseTotal = data?.savingSummary.expenseTotal ?? 0;
  const savingTotal = data?.savingSummary.savingTotal ?? 0;
  const netBalance = incomeTotal - expenseTotal - savingTotal;

  const hour = new Date().getHours();
  const timeGreeting = hour < 11 ? "おはようございます" : hour < 18 ? "こんにちは" : "こんばんは";
  const firstName = user.name.split(" ")[0] ?? user.name;

  return (
    <AppLayout onLogout={onLogout} title="ホーム" user={user}>
      <div className="dash-layout">

        {/* ── Main column ───────────────────────── */}
        <div className="dash-col-main">

          {/* Hero: Balance card */}
          <div className="dash-hero animate-fade-up">
            <p className="dash-hero__greeting">{timeGreeting}、{firstName}さん</p>

            <div className="dash-hero__balance-row">
              <p className="dash-hero__amount">
                {balanceVisible ? formatCurrency(totalBalance) : "¥ ••••••"}
              </p>
              <button
                className="dash-hero__eye"
                onClick={() => setBalanceVisible(v => !v)}
                type="button"
                aria-label={balanceVisible ? "残高を隠す" : "残高を表示"}
              >
                {balanceVisible
                  ? <Eye size={15} strokeWidth={2} />
                  : <EyeOff size={15} strokeWidth={2} />
                }
              </button>
            </div>

            <div className="dash-hero__stats">
              {[
                { label: "収入", value: `+${formatCurrency(incomeTotal)}`, color: "var(--jade)" },
                { label: "支出", value: `-${formatCurrency(expenseTotal)}`, color: "var(--coral)" },
                { label: "貯金", value: formatCurrency(savingTotal), color: "var(--amber)" },
                { label: "収支", value: formatCurrency(netBalance), color: netBalance >= 0 ? "var(--jade)" : "var(--coral)" },
              ].map(({ label, value, color }) => (
                <div key={label} className="dash-hero__stat">
                  <span>{label}</span>
                  <strong style={{ color }}>{value}</strong>
                </div>
              ))}
            </div>
          </div>

          {/* Quick actions */}
          <div className="dash-actions">
            <QuickAction to="/record"  icon={SquarePen}     label="記録"    color="var(--jade)" />
            <QuickAction to="/ledger"  icon={TrendingUp}    label="家計簿"  />
            <QuickAction to="/goals"   icon={Flag}          label="目標"    color="var(--amber)" />
            <QuickAction to="/chat"    icon={MessageCircle} label="AI相談"  color="var(--sky)" />
          </div>

          {/* Pending candidates banner */}
          {pendingCount > 0 && (
            <div className="dash-today dash-today--has-pending animate-fade-up">
              <div className="dash-today__headline">
                <span className="dash-today__count">{pendingCount}</span>
                <span className="dash-today__count-label">件の未整理があります</span>
              </div>
              <p className="dash-today__sub">
                今日の記録 {data?.todayRecordCount ?? 0}件 · 今期の貯金 {formatCurrency(savingTotal)}
              </p>
              <div className="dash-today__actions">
                <button
                  className="btn btn--fill btn--sm"
                  onClick={() => navigate("/inbox")}
                  type="button"
                >
                  <Inbox size={14} strokeWidth={2} />
                  候補を確認する
                </button>
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => navigate("/record")}
                  type="button"
                >
                  <SquarePen size={14} strokeWidth={2} />
                  すぐ記録する
                </button>
              </div>
            </div>
          )}

          {/* Recent records */}
          <div className="dash-panel animate-fade-up">
            <div className="dash-panel-head">
              <p className="dash-panel-title">最近の記録</p>
              <Link className="dash-panel-link" to="/ledger">すべて見る</Link>
            </div>
            {data?.recentRecords.length ? (
              <div className="home-record-list">
                {data.recentRecords.map((r) => (
                  <div className="home-record-item" key={r.id}>
                    <span className={`badge ${typeBadge[r.type] ?? "badge--move"}`}>
                      {typeLabel[r.type] ?? r.type}
                    </span>
                    <p className="home-record-item__memo">{r.memo ?? "メモなし"}</p>
                    <p className="home-record-item__date">{formatDate(r.recordDate)}</p>
                    <strong className={cn("home-record-item__amount", amountClass[r.type])}>
                      {formatCurrency(r.amount)}
                    </strong>
                  </div>
                ))}
                <Link className="home-view-all" to="/ledger">家計簿をすべて見る</Link>
              </div>
            ) : (
              <div className="empty">
                <SquarePen size={28} strokeWidth={1.5} style={{ color: "var(--text-3)" }} />
                <span>まだ記録がありません。最初の記録を追加しましょう。</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Side column ────────────────────────── */}
        <div className="dash-col-side">

          {/* Focused goal */}
          <div className="dash-panel animate-fade-up">
            <div className="dash-panel-head">
              <p className="dash-panel-title">フォーカス目標</p>
              <Link className="dash-panel-link" to="/goals">一覧</Link>
            </div>
            {goal ? (
              <div className="dash-goal">
                <div className="dash-goal__body">
                  <p className="dash-goal__name">{goal.title}</p>
                  <p className="dash-goal__copy">{goal.visual.headlineText}</p>
                  <div className="goal-progress-rail">
                    <div
                      className="goal-progress-fill"
                      style={{ width: `${Math.min(goal.achievementRate, 100)}%` }}
                    />
                  </div>
                  <div className="dash-goal__meta">
                    <strong>{goal.achievementRate}%</strong>
                    <span>残り {formatCurrency(goal.remainingAmount)}</span>
                    {goal.remainingDays !== null
                      ? <span>あと {goal.remainingDays}日</span>
                      : <span>期限なし</span>}
                  </div>
                </div>
              </div>
            ) : (
              <div className="dash-goal-empty">
                <p className="dash-goal-empty__text">まだ目標がありません</p>
                <Link className="btn btn--out btn--sm" to="/goals">
                  最初の目標を作る
                </Link>
              </div>
            )}
          </div>

          {/* Accounts snapshot */}
          <div className="dash-panel animate-fade-up">
            <div className="dash-panel-head">
              <p className="dash-panel-title">口座</p>
              <Link className="dash-panel-link" to="/accounts">管理</Link>
            </div>
            {accounts.length ? (
              <div className="dash-accounts">
                {accounts.slice(0, 4).map((a) => (
                  <div className="dash-account-row" key={a.id}>
                    <div className="dash-account-row__info">
                      <p className="dash-account-row__name">{a.name}</p>
                      <p className="dash-account-row__type">
                        {accountTypeLabel[a.type] ?? a.type}
                        {a.isPrimary ? " · メイン" : ""}
                      </p>
                    </div>
                    <strong className="dash-account-row__balance">
                      {balanceVisible ? formatCurrency(a.balance) : "¥••••"}
                    </strong>
                  </div>
                ))}
              </div>
            ) : (
              <Link className="home-empty-link" to="/accounts">口座を追加する →</Link>
            )}
          </div>

          {/* Today's mission */}
          {data?.mission.message ? (
            <div className="dash-mission animate-fade-up">
              <p className="dash-mission__label">今日の指針</p>
              <p className="dash-mission__text">{data.mission.message}</p>
            </div>
          ) : null}

          {/* AI CTA */}
          <Link className="dash-ai-cta animate-fade-up" to="/chat">
            <Sparkles size={20} strokeWidth={1.8} style={{ color: "var(--brand)", flexShrink: 0 }} />
            <div className="dash-ai-cta__copy">
              <p className="dash-ai-cta__title">AI相談</p>
              <p className="dash-ai-cta__sub">家計の疑問をAIに相談する</p>
            </div>
            <ChevronRight size={16} strokeWidth={2} style={{ color: "var(--text-3)", flexShrink: 0 }} />
          </Link>
        </div>

      </div>
    </AppLayout>
  );
}
