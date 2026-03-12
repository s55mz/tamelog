import { useEffect, useState } from "react";

import { apiRequest } from "../lib/api";
import { getAuthToken } from "../lib/storage";

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

export function ProgressPage() {
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
    <main className="screen-shell">
      <section className="panel panel-wide">
        <span className="eyebrow">Progress</span>
        <h1>進捗</h1>
        <div className="status-grid">
          <article className="status-card"><h2>今期の収入</h2><p>{stats?.incomeTotal ?? 0} 円</p></article>
          <article className="status-card"><h2>今期の支出</h2><p>{stats?.expenseTotal ?? 0} 円</p></article>
          <article className="status-card"><h2>今期の貯金</h2><p>{stats?.savingTotal ?? 0} 円</p></article>
          <article className="status-card"><h2>連続記録</h2><p>{stats?.streakDays ?? 0} 日</p></article>
        </div>

        <div className="stack">
          <h2 className="section-subtitle">概要</h2>
          {topExpenseCategories.length ? (
            topExpenseCategories.map((item) => (
              <article className="subpanel" key={item.name}>
                <strong>{item.name}</strong>
                <p>{item.total} 円</p>
              </article>
            ))
          ) : (
            <p>今期の支出カテゴリはまだありません。</p>
          )}
        </div>

        <div className="stack">
          <h2 className="section-subtitle">AI 分析</h2>
          <button className="button" onClick={generateAnalysis} type="button">
            分析を生成
          </button>
          {analysis ? <article className="subpanel"><p>{analysis}</p></article> : <p>まだ分析はありません。</p>}
        </div>
      </section>
    </main>
  );
}
