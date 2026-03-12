import { useEffect, useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { apiRequest } from "../lib/api";
import { getAuthToken } from "../lib/storage";
import type { AppUser } from "../lib/types";

type Stats = {
  currentPeriodId: string;
  incomeTotal: number;
  expenseTotal: number;
  savingTotal: number;
  streakDays: number;
};

type RecordItem = {
  id: string;
  amount: number;
  type: string;
  periodId: string;
  category: { id: string; name: string } | null;
};

type ProgressPageProps = {
  user: AppUser;
  onLogout: () => Promise<void>;
};

export function ProgressPage({ user, onLogout }: ProgressPageProps) {
  const token = getAuthToken();
  const [stats, setStats] = useState<Stats | null>(null);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [analysis, setAnalysis] = useState<string>("");

  useEffect(() => {
    if (!token) {
      return;
    }

    void apiRequest<Stats>("/api/users/me/stats", { token }).then(async (statsData) => {
      setStats(statsData);
      const recordsData = await apiRequest<{ records: RecordItem[] }>(`/api/records?periodId=${statsData.currentPeriodId}`, { token });
      setRecords(recordsData.records);
      const month = new Date().toISOString().slice(0, 7);
      const analysisData = await apiRequest<{ analysis: null | { content: string } }>(`/api/analysis?month=${month}`, { token }).catch(() => ({ analysis: null }));
      setAnalysis(analysisData.analysis?.content ?? "");
    });
  }, [token]);

  const generateAnalysis = async () => {
    if (!token) {
      return;
    }

    const month = new Date().toISOString().slice(0, 7);
    const data = await apiRequest<{ analysis: { content: string } }>("/api/analysis/generate", {
      method: "POST",
      token,
      body: { month }
    });
    setAnalysis(data.analysis.content);
  };

  const topExpenseCategories = Object.values(
    records
      .filter((record) => record.type === "EXPENSE" && record.category)
      .reduce<Record<string, { name: string; total: number }>>((acc, record) => {
        const key = record.category!.id;
        acc[key] ??= { name: record.category!.name, total: 0 };
        acc[key].total += record.amount;
        return acc;
      }, {})
  ).sort((left, right) => right.total - left.total);

  return (
    <AppLayout onLogout={onLogout} subtitle="期間の流れと支出傾向を落ち着いて確認する画面です。" title="進捗" user={user}>
      <section className="dashboard-grid">
        <article className="surface-card compact-surface"><h2>今期の収入</h2><p className="mini-stat">{stats?.incomeTotal ?? 0} 円</p></article>
        <article className="surface-card compact-surface"><h2>今期の支出</h2><p className="mini-stat">{stats?.expenseTotal ?? 0} 円</p></article>
        <article className="surface-card compact-surface"><h2>今期の貯金</h2><p className="mini-stat">{stats?.savingTotal ?? 0} 円</p></article>
        <article className="surface-card compact-surface"><h2>連続記録</h2><p className="mini-stat">{stats?.streakDays ?? 0} 日</p></article>
      </section>

      <section className="content-section">
        <div className="section-heading-row"><div><p className="section-label">Overview</p><h2 className="section-title">支出カテゴリ上位</h2></div></div>
        <div className="goal-list">
          {topExpenseCategories.length ? (
            topExpenseCategories.map((item) => (
              <article className="goal-row-card" key={item.name}>
                <strong>{item.name}</strong>
                <p>{item.total} 円</p>
              </article>
            ))
          ) : (
            <article className="empty-card">今期の支出カテゴリはまだありません。</article>
          )}
        </div>
      </section>

      <section className="content-section">
        <article className="surface-card form-card">
          <p className="section-label">AI Analysis</p>
          <h2 className="section-title">月次分析</h2>
          <div className="stack compact">
          <button className="button" onClick={generateAnalysis} type="button">
            分析を生成
          </button>
          {analysis ? <article className="subpanel"><p>{analysis}</p></article> : <p>まだ分析はありません。</p>}
          </div>
        </article>
      </section>
    </AppLayout>
  );
}
