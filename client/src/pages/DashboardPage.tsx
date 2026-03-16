import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { AppLayout } from "../components/AppLayout";
import { EmptyState } from "../components/ui";
import { apiRequest } from "../lib/api";
import { formatCurrency, formatDate } from "../lib/format";
import { getAuthToken } from "../lib/storage";
import type { AppUser } from "../lib/types";

type DashboardPageProps = {
  user: AppUser;
  onLogout: () => Promise<void>;
};

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
};

type Account = {
  id: string;
  name: string;
  type: string;
  balance: number;
  isPrimary?: boolean;
};

const typeLabel: Record<string, string> = {
  INCOME: "収入",
  EXPENSE: "支出",
  SAVING: "貯金",
  TRANSFER: "移動"
};

const typeTone: Record<string, string> = {
  INCOME: "is-positive",
  EXPENSE: "is-negative",
  SAVING: "is-accent",
  TRANSFER: "is-neutral"
};

const accountTypeLabel: Record<string, string> = {
  BANK: "銀行",
  CASH: "現金",
  CREDIT: "クレカ"
};

export function DashboardPage({ user, onLogout }: DashboardPageProps) {
  const token = getAuthToken();
  const [data, setData] = useState<DashboardData | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    if (!token) {
      return;
    }

    void Promise.all([
      apiRequest<DashboardData>("/api/dashboard", { token }),
      apiRequest<{ accounts: Account[] }>("/api/accounts", { token })
    ]).then(([dashboardData, accountData]) => {
      setData(dashboardData);
      setAccounts(accountData.accounts);
    });
  }, [token]);

  const totalBalance = useMemo(
    () => accounts.reduce((sum, account) => sum + account.balance, 0),
    [accounts]
  );

  const mainAccount = useMemo(
    () => accounts.find((account) => account.isPrimary) ?? accounts[0] ?? null,
    [accounts]
  );

  const spendingCount = useMemo(
    () => data?.recentRecords.filter((record) => record.type === "EXPENSE").length ?? 0,
    [data]
  );

  const goal = data?.focusedGoal;
  const mobileQuickActions = [
    { to: "/record", label: "記録", icon: "edit_square" },
    { to: "/ledger", label: "家計簿", icon: "receipt_long" },
    { to: "/goals", label: "目標", icon: "flag" },
    { to: "/accounts", label: "口座", icon: "account_balance_wallet" }
  ];

  return (
    <AppLayout
      onLogout={onLogout}
      title="ホーム"
      user={user}
    >
      <section className="home-mobile-overview">
        <div className="home-hero-card">
          {/* 上段: greeting + badge */}
          <div className="home-hero-card__top">
            <p className="home-hero-card__greeting">{data?.greeting ?? "今日の状況"}</p>
            <span className="home-hero-card__badge">給料日 {user.paydayOfMonth}日</span>
          </div>

          {/* Big Metric */}
          <p className="home-hero-card__label">口座全体の残高</p>
          <div className="home-hero-card__balance">{formatCurrency(totalBalance)}</div>

          {/* stats */}
          <div className="home-hero-card__stats">
            <div className="home-hero-card__stat">
              <span>今期の貯金</span>
              <strong>{formatCurrency(data?.savingSummary.savingTotal ?? 0)}</strong>
            </div>
            <div className="home-hero-card__stat">
              <span>メイン口座</span>
              <strong>{mainAccount?.name ?? "未設定"}</strong>
            </div>
            <div className="home-hero-card__stat">
              <span>目標</span>
              <strong>{goal ? `${goal.achievementRate}%` : "―"}</strong>
            </div>
          </div>
        </div>

        <div className="home-mobile-actions">
          {mobileQuickActions.map((action) => (
            <Link className="home-mobile-action" key={action.to} to={action.to}>
              <span className="home-mobile-action-icon material-symbols-outlined">{action.icon}</span>
              <span>{action.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-hero">
        <div className="home-hero-main">
          <p className="home-hero-kicker">{data?.greeting ?? "今日の状況"}</p>
          <h2>{formatCurrency(totalBalance)}</h2>
          <p className="home-hero-copy">
            口座の残高をまとめて確認し、記録や目標への動線をすぐに使えます。
          </p>

          <div className="home-stat-grid">
            <article className="home-stat-card">
              <span>今期の貯金</span>
              <strong>{formatCurrency(data?.savingSummary.savingTotal ?? 0)}</strong>
              <p>{data?.savingSummary.currentPeriodId ?? "今期"} ベース</p>
            </article>
            <article className="home-stat-card">
              <span>メイン口座</span>
              <strong>{mainAccount ? formatCurrency(mainAccount.balance) : "未設定"}</strong>
              <p>
                {mainAccount
                  ? `${mainAccount.name} · ${accountTypeLabel[mainAccount.type] ?? mainAccount.type}`
                  : "口座を追加してください"}
              </p>
            </article>
            <article className="home-stat-card">
              <span>最近の支出件数</span>
              <strong>{spendingCount}件</strong>
              <p>直近の記録から自動集計</p>
            </article>
          </div>

          <div className="home-hero-actions">
            <Link className="btn btn--fill" to="/record">
              <span className="material-symbols-outlined">edit_square</span>
              いますぐ記録
            </Link>
            <Link className="btn btn--out" to="/ledger">
              <span className="material-symbols-outlined">receipt_long</span>
              家計簿を見る
            </Link>
          </div>
        </div>

        <aside className="home-hero-side">
          <p className="home-panel-label">今日の指針</p>
          <h3>{data?.mission.message ?? "小さく記録して、振り返りを軽くする。"}</h3>
          <p>今日の指針をもとに、小さな記録を積み重ねましょう。</p>
          <div className="home-chip-row">
            <span className="home-chip">給料日 {user.paydayOfMonth}日</span>
            <span className="home-chip">{accounts.length}口座</span>
            <span className="home-chip">{goal ? "目標進行中" : "目標未作成"}</span>
          </div>
        </aside>
      </section>

      <section className="home-grid">
        <article className="home-panel">
          <div className="home-panel-head">
            <div>
              <p className="home-panel-label">フォーカス目標</p>
              <h3>フォーカス中の目標</h3>
            </div>
            <Link className="btn btn--ghost btn--sm" to="/goals">
              目標一覧
            </Link>
          </div>

          {goal ? (
            <div className="goal-focus-card">
              <div className="goal-focus-visual">
                {goal.visual.imagePath ? (
                  <img alt={goal.visual.altText} src={goal.visual.imagePath} />
                ) : (
                  <span className="material-symbols-outlined">flag</span>
                )}
              </div>
              <div className="goal-focus-body">
                <p className="goal-focus-title">{goal.title}</p>
                <p className="goal-focus-copy">{goal.visual.headlineText}</p>
                <div className="goal-progress-rail">
                  <div
                    className="goal-progress-fill"
                    style={{ width: `${Math.min(goal.achievementRate, 100)}%` }}
                  />
                </div>
                <div className="goal-focus-meta">
                  <strong>{goal.achievementRate}% 達成</strong>
                  <span>残り {formatCurrency(goal.remainingAmount)}</span>
                  <span>
                    {goal.remainingDays !== null ? `あと ${goal.remainingDays}日` : "期限なし"}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <Link className="home-empty-link" to="/goals">
              最初の目標を作る
            </Link>
          )}
        </article>

        <article className="home-panel">
          <div className="home-panel-head">
            <div>
              <p className="home-panel-label">口座スナップショット</p>
              <h3>口座の残高</h3>
            </div>
            <Link className="btn btn--ghost btn--sm" to="/accounts">
              口座管理
            </Link>
          </div>

          {accounts.length ? (
            <div className="account-stack">
              {accounts.slice(0, 4).map((account) => (
                <div className="account-stack-item" key={account.id}>
                  <div>
                    <p className="account-stack-name">{account.name}</p>
                    <p className="account-stack-meta">
                      {accountTypeLabel[account.type] ?? account.type}
                      {account.isPrimary ? " · メイン" : ""}
                    </p>
                  </div>
                  <strong>{formatCurrency(account.balance)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <Link className="home-empty-link" to="/accounts">
              最初の口座を追加する
            </Link>
          )}
        </article>
      </section>

      <section className="home-panel">
        <div className="home-panel-head">
          <div>
            <p className="home-panel-label">最近の記録</p>
            <h3>最近の記録</h3>
          </div>
          <Link className="btn btn--ghost btn--sm" to="/record">
            記録を追加
          </Link>
        </div>

        {data?.recentRecords?.length ? (
          <div className="record-stack">
            {data.recentRecords.map((record) => (
              <div className="record-stack-item" key={record.id}>
                <div className={`record-type-pill ${typeTone[record.type] ?? "is-neutral"}`}>
                  {typeLabel[record.type] ?? record.type}
                </div>
                <div className="record-stack-body">
                  <p className="record-stack-title">{record.memo ?? "メモなし"}</p>
                  <p className="record-stack-meta">{formatDate(record.recordDate)}</p>
                </div>
                <strong className="record-stack-amount">
                  {record.type === "EXPENSE" ? "-" : "+"}
                  {formatCurrency(record.amount)}
                </strong>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>まだ記録がありません。</EmptyState>
        )}
      </section>
    </AppLayout>
  );
}
