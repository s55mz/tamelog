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

const typeBadge: Record<string, string> = {
  INCOME: "badge badge--in",
  EXPENSE: "badge badge--out",
  SAVING: "badge badge--save",
  TRANSFER: "badge badge--move"
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
    if (!token) return;
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

  const goal = data?.focusedGoal;

  return (
    <AppLayout onLogout={onLogout} title="ホーム" user={user}>
      {/* ── Balance hero ───────────────────────────────── */}
      <div className="card" style={{ textAlign: "center", padding: "var(--s6) var(--s5) var(--s5)" }}>
        <p className="eyebrow" style={{ marginBottom: "var(--s2)" }}>総口座残高</p>
        <p className="stat__value stat__value--xl" style={{ marginTop: 0, marginBottom: "var(--s3)", fontSize: "clamp(36px, 8vw, 56px)" }}>
          {formatCurrency(totalBalance)}
        </p>
        <div className="row row--wrap" style={{ gap: "var(--s2)", justifyContent: "center" }}>
          <span style={{ fontSize: "12px", color: "var(--text-2)" }}>
            口座数 {accounts.length}
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-3)" }}>·</span>
          <span style={{ fontSize: "12px", color: "var(--text-2)" }}>
            今期貯金 {formatCurrency(data?.savingSummary.savingTotal ?? 0)}
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-3)" }}>·</span>
          <span style={{ fontSize: "12px", color: "var(--text-2)" }}>
            給料日 {user.paydayOfMonth}日
          </span>
        </div>
      </div>

      {/* ── Accounts strip ─────────────────────────────── */}
      {accounts.length > 0 ? (
        <div>
          <p className="eyebrow" style={{ marginBottom: "var(--s3)" }}>口座</p>
          <div style={{ display: "flex", gap: "var(--s3)", overflowX: "auto", paddingBottom: "var(--s2)" }}>
            {accounts.map((account) => (
              <div
                key={account.id}
                className="card"
                style={{ minWidth: "160px", flexShrink: 0, padding: "var(--s4)" }}
              >
                <p className="account-card__type">
                  {accountTypeLabel[account.type] ?? account.type}
                  {account.isPrimary ? " · メイン" : ""}
                </p>
                <p style={{ fontSize: "14px", fontWeight: 600, marginTop: "var(--s1)", marginBottom: "var(--s1)" }}>
                  {account.name}
                </p>
                <p style={{ fontSize: "18px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {formatCurrency(account.balance)}
                </p>
              </div>
            ))}
            <Link
              to="/accounts"
              className="card"
              style={{
                minWidth: "120px",
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "var(--s2)",
                padding: "var(--s4)",
                color: "var(--text-2)",
                fontSize: "13px",
                borderStyle: "dashed"
              }}
            >
              <span className="material-symbols-outlined">arrow_forward</span>
              口座を管理
            </Link>
          </div>
        </div>
      ) : (
        <Link className="card" to="/accounts" style={{ display: "block", textAlign: "center", padding: "var(--s6)", borderStyle: "dashed", color: "var(--text-2)" }}>
          <span className="material-symbols-outlined" style={{ display: "block", marginBottom: "var(--s2)", fontSize: "28px" }}>account_balance_wallet</span>
          口座を追加する
        </Link>
      )}

      {/* ── Main Goal card ─────────────────────────────── */}
      <div>
        <div className="row row--spread" style={{ marginBottom: "var(--s3)" }}>
          <p className="eyebrow">メイン目標</p>
          <Link className="btn btn--ghost btn--sm" to="/goals">すべて見る</Link>
        </div>
        {goal ? (
          <div className="card">
            <div className="row" style={{ gap: "var(--s4)" }}>
              {goal.visual.imagePath ? (
                <div style={{
                  width: 80,
                  height: 80,
                  borderRadius: "var(--r3)",
                  background: "var(--bg-2)",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  padding: "var(--s2)"
                }}>
                  <img alt={goal.visual.altText} src={goal.visual.imagePath} style={{ objectFit: "contain", width: "100%", height: "100%" }} />
                </div>
              ) : null}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "15px", fontWeight: 700, marginBottom: "var(--s1)" }}>{goal.title}</p>
                <p style={{ fontSize: "12px", color: "var(--text-2)", marginBottom: "var(--s3)" }}>{goal.visual.headlineText}</p>
                <div className="prog prog--orange" style={{ marginBottom: "var(--s2)" }}>
                  <div className="prog__fill" style={{ width: `${Math.min(goal.achievementRate, 100)}%` }} />
                </div>
                <div className="row row--spread">
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--orange)" }}>{goal.achievementRate}%</span>
                  <span style={{ fontSize: "12px", color: "var(--text-2)" }}>
                    残り {formatCurrency(goal.remainingAmount)}
                    {goal.remainingDays !== null ? ` · ${goal.remainingDays}日` : ""}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <Link className="card" to="/goals" style={{ display: "block", textAlign: "center", padding: "var(--s6)", borderStyle: "dashed", color: "var(--text-2)" }}>
            <span className="material-symbols-outlined" style={{ display: "block", marginBottom: "var(--s2)", fontSize: "28px" }}>flag</span>
            最初の目標を作る
          </Link>
        )}
      </div>

      {/* ── Recent records ─────────────────────────────── */}
      <div>
        <div className="row row--spread" style={{ marginBottom: "var(--s3)" }}>
          <p className="eyebrow">最近の記録</p>
          <Link className="btn btn--ghost btn--sm" to="/record">記録を追加</Link>
        </div>
        {data?.recentRecords?.length ? (
          <div className="entry-list">
            {data.recentRecords.map((record) => (
              <div className="entry" key={record.id}>
                <span className={typeBadge[record.type] ?? "badge"}>
                  {typeLabel[record.type] ?? record.type}
                </span>
                <div className="entry__body">
                  <p className="entry__title">{record.memo ?? "メモなし"}</p>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p
                    className="entry__amount"
                    style={{ color: record.type === "EXPENSE" ? "var(--coral)" : record.type === "INCOME" ? "var(--jade)" : "var(--amber)" }}
                  >
                    {record.type === "EXPENSE" ? "-" : "+"}{formatCurrency(record.amount)}
                  </p>
                  <p className="entry__meta">{formatDate(record.recordDate)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>まだ記録がありません。</EmptyState>
        )}
      </div>
    </AppLayout>
  );
}
