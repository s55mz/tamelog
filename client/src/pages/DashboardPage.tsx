import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { AppLayout } from "../components/AppLayout";
import { apiRequest } from "../lib/api";
import { getAuthToken } from "../lib/storage";
import type { AppUser } from "../lib/types";

type DashboardPageProps = {
  user: AppUser;
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
    }>("/api/dashboard", { token }).then(setData);
  }, [token]);

  return (
    <AppLayout onLogout={onLogout} subtitle="今日の状況、目標、次の一歩が静かに見えるホームです。" title="ホーム" user={user}>
      <section className="shellHero">
        {data?.focusedGoal && (
          <article className="surface-card feature-goal-card">
            <p className="section-label">Focused Goal</p>
            <div className="goal-visual-frame hero-visual">
              <img alt={data.focusedGoal.visual.altText} className="goal-visual-image" src={data.focusedGoal.visual.imagePath} />
            </div>
            <p className="muted-copy">{data.focusedGoal.visual.headlineText}</p>
            <h2>{data.focusedGoal.title}</h2>
            <div className="numberDisplay">{data.focusedGoal.achievementRate}%</div>
            <p className="muted-copy">
              {data.focusedGoal.currentAmount} / {data.focusedGoal.targetAmount} 円
            </p>
            <div className="progress-track large">
              <div className="progress-value" style={{ width: `${Math.min(data.focusedGoal.achievementRate, 100)}%` }} />
            </div>
            <div className="goal-meta-row">
              <span>残り {data.focusedGoal.remainingAmount} 円</span>
              <span>{data.focusedGoal.remainingDays ?? "-"} 日</span>
            </div>
          </article>
        )}

        <div className="dashboard-stack">
          <article className="surface-card compact-surface">
            <p className="section-label">Savings</p>
            <h2>今期の貯金</h2>
            <p className="mini-stat">{data?.savingSummary.savingTotal ?? 0} 円</p>
          </article>
          <article className="surface-card compact-surface">
            <p className="section-label">Period</p>
            <h2>現在の期間</h2>
            <p>{data?.savingSummary.currentPeriodId ?? "-"}</p>
          </article>
          <article className="surface-card compact-surface">
            <p className="section-label">Mission</p>
            <h2>今日のミッション</h2>
            <p>{data?.mission.message ?? "続ける準備を整えましょう"}</p>
          </article>
          <article className="surface-card compact-surface">
            <p className="section-label">Payday</p>
            <h2>給料日</h2>
            <p>{user.paydayOfMonth}日</p>
          </article>
        </div>
      </section>

      <section className="content-section">
        <div className="dashboard-grid">
          <article className="surface-card">
            <p className="section-label">Salary Day</p>
            <h2 className="section-title">給料日の準備</h2>
            <p className="muted-copy">給料日が近づいたら、収入記録と今月の配分を先に整えておくと安定します。</p>
            <div className="pillRow">
              <span className="softPill">毎月 {user.paydayOfMonth}日</span>
              <Link className="button" to="/record">収入を記録する</Link>
            </div>
          </article>
          <article className="surface-card">
            <p className="section-label">Impulse Check</p>
            <h2 className="section-title">衝動買いチェック</h2>
            <p className="muted-copy">欲しいものが出たら、一度ここに置いて 24 時間だけ待つ流れにします。</p>
            <Link className="button" to="/impulse">確認する</Link>
          </article>
        </div>
      </section>

      <section className="content-section">
        <div className="section-heading-row">
          <div>
            <p className="section-label">Recent</p>
            <h2 className="section-title">最近の記録</h2>
          </div>
        </div>
        <div className="goal-list">
          {data?.recentRecords?.length ? (
            data.recentRecords.map((record) => (
              <article className="goal-row-card" key={record.id}>
                <div className="goal-row-copy">
                  <strong>{record.type} {record.amount} 円</strong>
                  <p className="muted-copy">{record.recordDate}</p>
                </div>
                {record.memo && <p>{record.memo}</p>}
              </article>
            ))
          ) : (
            <article className="empty-card">まだ記録がありません。</article>
          )}
        </div>
      </section>
    </AppLayout>
  );
}
