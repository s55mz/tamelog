import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { AppLayout } from "../components/AppLayout";
import { EmptyState } from "../components/ui";
import { apiRequest } from "../lib/api";
import { useAutoRefresh } from "../lib/autoRefresh";
import { formatCurrency, formatDate } from "../lib/format";
import { getAuthToken } from "../lib/storage";
import type { AppUser } from "../lib/types";

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

// ─── Lookup maps ──────────────────────────────────────────────────────────────

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
  INCOME: "home-record-item__amount--positive",
  EXPENSE: "home-record-item__amount--negative",
  SAVING: "home-record-item__amount--neutral",
  SAVING_MOVE: "home-record-item__amount--neutral",
  TRANSFER: "home-record-item__amount--neutral",
};
const accountTypeLabel: Record<string, string> = {
  BANK: "銀行", CASH: "現金", CREDIT: "クレカ",
};

// ─── Component ────────────────────────────────────────────────────────────────

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
  const mainAccount = useMemo(
    () => accounts.find((a) => a.isPrimary) ?? accounts[0] ?? null,
    [accounts],
  );
  const goal = data?.focusedGoal ?? null;
  const pendingCount = data?.pendingCandidateCount ?? 0;

  const incomeTotal = data?.savingSummary.incomeTotal ?? 0;
  const expenseTotal = data?.savingSummary.expenseTotal ?? 0;
  const savingTotal = data?.savingSummary.savingTotal ?? 0;

  // 時間帯別挨拶
  const hour = new Date().getHours();
  const greeting = hour < 11 ? "おはようございます" : hour < 18 ? "こんにちは" : "こんばんは";

  return (
    <AppLayout onLogout={onLogout} title="ホーム" user={user}>
      <div className="dash-layout">

        {/* ── メインカラム ─────────────────────────────── */}
        <div className="dash-col-main">

          {/* ヒーロー: グラデーション残高カード */}
          <div className="dash-hero">
            {/* 挨拶 */}
            <p className="dash-hero__greeting">{greeting}、{user.name.split(" ")[0]}さん</p>
            {/* 残高 */}
            <div className="dash-hero__balance-row">
              <p className="dash-hero__amount">
                {balanceVisible ? formatCurrency(totalBalance) : "¥ ••••••"}
              </p>
              <button
                className="dash-hero__eye"
                onClick={() => setBalanceVisible((v) => !v)}
                type="button"
                aria-label={balanceVisible ? "残高を隠す" : "残高を表示"}
              >
                <span className="material-symbols-outlined">
                  {balanceVisible ? "visibility" : "visibility_off"}
                </span>
              </button>
            </div>

            {/* 統計行 */}
            <div className="dash-hero__stats">
              <div className="dash-hero__stat">
                <span>収入</span>
                <strong>+{formatCurrency(incomeTotal)}</strong>
              </div>
              <div className="dash-hero__stat-sep" />
              <div className="dash-hero__stat">
                <span>支出</span>
                <strong>-{formatCurrency(expenseTotal)}</strong>
              </div>
              <div className="dash-hero__stat-sep" />
              <div className="dash-hero__stat">
                <span>貯金</span>
                <strong>{formatCurrency(savingTotal)}</strong>
              </div>
              <div className="dash-hero__stat-sep" />
              <div className="dash-hero__stat">
                <span>収支</span>
                <strong>{formatCurrency(incomeTotal - expenseTotal - savingTotal)}</strong>
              </div>
            </div>

          </div>

          {/* ── クイックアクション ────────────────────── */}
          <div className="dash-actions">
            <Link className="dash-actions__btn" to="/record">
              <span className="dash-actions__icon"><span className="material-symbols-outlined">edit_square</span></span>
              <span className="dash-actions__label">記録</span>
            </Link>
            <Link className="dash-actions__btn" to="/ledger">
              <span className="dash-actions__icon"><span className="material-symbols-outlined">receipt_long</span></span>
              <span className="dash-actions__label">家計簿</span>
            </Link>
            <Link className="dash-actions__btn" to="/goals">
              <span className="dash-actions__icon"><span className="material-symbols-outlined">savings</span></span>
              <span className="dash-actions__label">目標</span>
            </Link>
            <Link className="dash-actions__btn" to="/chat">
              <span className="dash-actions__icon"><span className="material-symbols-outlined">chat_bubble</span></span>
              <span className="dash-actions__label">AI相談</span>
            </Link>
          </div>

          {/* ── 今日やること ─────────────────────────── */}
          {pendingCount > 0 && (
            <div className="dash-today dash-today--has-pending">
              <div className="dash-today__headline">
                <span className="dash-today__count">{pendingCount}</span>
                <span className="dash-today__count-label">件の未整理があります</span>
              </div>
              <p className="dash-today__sub">
                今日の記録 {data?.todayRecordCount ?? 0}件 · 今期の貯金 {formatCurrency(data?.savingSummary.savingTotal ?? 0)}
              </p>
              <div className="dash-today__actions">
                <button
                  className="btn btn--fill"
                  onClick={() => navigate("/inbox")}
                  type="button"
                >
                  <span className="material-symbols-outlined">inbox</span>
                  候補を確認する
                </button>
                <button
                  className="btn btn--out"
                  onClick={() => navigate("/record")}
                  type="button"
                >
                  <span className="material-symbols-outlined">add</span>
                  すぐ記録する
                </button>
              </div>
            </div>
          )}

          {/* 最近の記録 */}
          <div className="dash-panel">
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
                    <strong className={`home-record-item__amount ${amountClass[r.type] ?? ""}`}>
                      {formatCurrency(r.amount)}
                    </strong>
                  </div>
                ))}
                <Link className="home-view-all" to="/ledger">家計簿をすべて見る</Link>
              </div>
            ) : (
              <EmptyState>まだ記録がありません。最初の記録を追加しましょう。</EmptyState>
            )}
          </div>
        </div>

        {/* ── サイドカラム ─────────────────────────────── */}
        <div className="dash-col-side">

          {/* フォーカス目標 */}
          <div className="dash-panel">
            <div className="dash-panel-head">
              <p className="dash-panel-title">フォーカス目標</p>
              <Link className="dash-panel-link" to="/goals">目標一覧</Link>
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
              <Link className="home-empty-link" to="/goals">最初の目標を作る</Link>
            )}
          </div>

          {/* 口座スナップショット */}
          <div className="dash-panel">
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
                      {formatCurrency(a.balance)}
                    </strong>
                  </div>
                ))}
              </div>
            ) : (
              <Link className="home-empty-link" to="/accounts">口座を追加する</Link>
            )}
          </div>

          {/* 今日の指針 */}
          {data?.mission.message ? (
            <div className="dash-mission">
              <p className="dash-mission__label">今日の指針</p>
              <p className="dash-mission__text">{data.mission.message}</p>
            </div>
          ) : null}

          {/* AI相談 CTA */}
          <Link className="dash-ai-cta" to="/chat">
            <span className="material-symbols-outlined">chat_bubble</span>
            <div className="dash-ai-cta__copy">
              <p className="dash-ai-cta__title">AI相談</p>
              <p className="dash-ai-cta__sub">家計の疑問をAIに相談する</p>
            </div>
            <span className="material-symbols-outlined dash-ai-cta__arrow">chevron_right</span>
          </Link>
        </div>

      </div>
    </AppLayout>
  );
}
