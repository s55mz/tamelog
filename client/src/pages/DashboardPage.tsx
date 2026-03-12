import { Link } from "react-router-dom";
import { useEffect, useState } from "react";

import { apiRequest } from "../lib/api";
import { getAuthToken } from "../lib/storage";

type DashboardPageProps = {
  user: {
    name: string;
    email: string;
    role: string;
    setupCompleted: boolean;
    paydayOfMonth: number;
  };
  onLogout: () => Promise<void>;
};

export function DashboardPage({ user, onLogout }: DashboardPageProps) {
  const token = getAuthToken();
  const [data, setData] = useState<{
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
  } | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }

    void apiRequest<{
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
    }>("/api/dashboard", { token }).then(setData);
  }, [token]);

  const handleLogout = async () => {
    await onLogout();
  };

  return (
    <main className="screen-shell">
      <section className="panel panel-wide">
        <span className="eyebrow">Phase 1</span>
        <h1>{data?.greeting ?? "おかえりなさい"}、{user.name}さん</h1>
        <p className="lead">今日の状況と次にやることを短く確認できます。</p>

        {data?.focusedGoal && (
          <section className="hero-card compact-card">
            <span className="eyebrow">注目の目標</span>
            <h2 className="section-subtitle">{data.focusedGoal.visual.headlineText}</h2>
            <p className="goal-title">{data.focusedGoal.title}</p>
            <p>あと {data.focusedGoal.remainingAmount} 円</p>
            <p>
              {data.focusedGoal.currentAmount} / {data.focusedGoal.targetAmount} 円
            </p>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${Math.min(data.focusedGoal.achievementRate, 100)}%` }} />
            </div>
            <p>{data.focusedGoal.achievementRate}% / {data.focusedGoal.remainingDays ?? "-"}日</p>
          </section>
        )}

        <div className="status-grid">
          <article className="status-card">
            <h2>今期の貯金</h2>
            <p>{data?.savingSummary.savingTotal ?? 0} 円</p>
          </article>
          <article className="status-card">
            <h2>現在の期間</h2>
            <p>{data?.savingSummary.currentPeriodId ?? "-"}</p>
          </article>
          <article className="status-card">
            <h2>今日のミッション</h2>
            <p>{data?.mission.message ?? "続ける準備を整えましょう"}</p>
          </article>
          <article className="status-card">
            <h2>給料日</h2>
            <p>{user.paydayOfMonth}日</p>
          </article>
        </div>

        <div className="stack">
          <h2 className="section-subtitle">最近の記録</h2>
          {data?.recentRecords?.length ? (
            data.recentRecords.map((record) => (
              <article className="subpanel" key={record.id}>
                <strong>{record.type} {record.amount} 円</strong>
                <p>{record.recordDate}</p>
                {record.memo && <p>{record.memo}</p>}
              </article>
            ))
          ) : (
            <p>まだ記録がありません。</p>
          )}
        </div>

        <div className="button-row">
          <Link className="button" to="/record">
            記録
          </Link>
          <Link className="button button-secondary" to="/ledger">
            家計簿
          </Link>
          <Link className="button button-secondary" to="/accounts">
            口座
          </Link>
          <Link className="button button-secondary" to="/progress">
            進捗
          </Link>
          {user.role === "ADMIN" && (
            <>
              <Link className="button button-secondary" to="/invite">
                招待
              </Link>
              <Link className="button button-secondary" to="/admin">
                管理者
              </Link>
            </>
          )}
          <button className="button button-secondary" onClick={handleLogout} type="button">
            ログアウト
          </button>
        </div>
      </section>
    </main>
  );
}
