import { useEffect, useMemo, useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { EmptyState } from "../components/ui";
import { apiRequest } from "../lib/api";
import { formatCurrency } from "../lib/format";
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
  const [analysis, setAnalysis] = useState("");
  const [tab, setTab] = useState<"overview" | "balance" | "analysis">("overview");

  useEffect(() => {
    if (!token) return;
    void apiRequest<Stats>("/api/users/me/stats", { token }).then(async (statsData) => {
      setStats(statsData);
      const recordsData = await apiRequest<{ records: RecordItem[] }>(
        `/api/records?periodId=${statsData.currentPeriodId}`,
        { token }
      );
      setRecords(recordsData.records);
      const month = new Date().toISOString().slice(0, 7);
      const analysisData = await apiRequest<{ analysis: null | { content: string } }>(
        `/api/analysis?month=${month}`,
        { token }
      ).catch(() => ({ analysis: null }));
      setAnalysis(analysisData.analysis?.content ?? "");
    });
  }, [token]);

  const generateAnalysis = async () => {
    if (!token) return;
    const month = new Date().toISOString().slice(0, 7);
    const data = await apiRequest<{ analysis: { content: string } }>("/api/analysis/generate", {
      method: "POST",
      token,
      body: { month }
    });
    setAnalysis(data.analysis.content);
  };

  const topExpenseCategories = useMemo(
    () =>
      Object.values(
        records
          .filter((record) => record.type === "EXPENSE" && record.category)
          .reduce<Record<string, { name: string; total: number }>>((acc, record) => {
            const key = record.category!.id;
            acc[key] ??= { name: record.category!.name, total: 0 };
            acc[key].total += record.amount;
            return acc;
          }, {})
      ).sort((left, right) => right.total - left.total),
    [records]
  );

  const maxValue = Math.max(stats?.incomeTotal ?? 0, stats?.expenseTotal ?? 0, stats?.savingTotal ?? 0, 1);

  return (
    <AppLayout onLogout={onLogout} title="進捗" user={user}>
      {/* ── Stats ─────────────────────────────────────── */}
      <div className="four-up">
        <div className="card"><div className="stat"><p className="stat__label">収入</p><p className="stat__value stat__value--jade">{formatCurrency(stats?.incomeTotal ?? 0)}</p></div></div>
        <div className="card"><div className="stat"><p className="stat__label">支出</p><p className="stat__value stat__value--coral">{formatCurrency(stats?.expenseTotal ?? 0)}</p></div></div>
        <div className="card"><div className="stat"><p className="stat__label">貯金</p><p className="stat__value stat__value--amber">{formatCurrency(stats?.savingTotal ?? 0)}</p></div></div>
        <div className="card"><div className="stat"><p className="stat__label">記録継続</p><p className="stat__value">{stats?.streakDays ?? 0}日</p></div></div>
      </div>

      {/* ── Tab selector ──────────────────────────────── */}
      <div className="seg">
        {(["overview", "balance", "analysis"] as const).map((t) => (
          <button
            className={`seg__btn ${tab === t ? "on" : ""}`}
            key={t}
            onClick={() => setTab(t)}
            type="button"
          >
            {{ overview: "支出内訳", balance: "収支比率", analysis: "AI分析" }[t]}
          </button>
        ))}
      </div>

      {/* ── Overview ──────────────────────────────────── */}
      {tab === "overview" ? (
        <div className="card">
          <p className="eyebrow" style={{ marginBottom: "var(--s3)" }}>支出カテゴリの重さ</p>
          {topExpenseCategories.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--s3)" }}>
              {topExpenseCategories.map((item) => (
                <div key={item.name}>
                  <div className="row row--spread" style={{ marginBottom: "var(--s1)" }}>
                    <span style={{ fontSize: "14px", fontWeight: 500 }}>{item.name}</span>
                    <span style={{ fontSize: "13px", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{formatCurrency(item.total)}</span>
                  </div>
                  <div className="prog prog--coral">
                    <div
                      className="prog__fill"
                      style={{ width: `${(item.total / (topExpenseCategories[0]?.total ?? 1)) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>今期の支出カテゴリはまだありません。</EmptyState>
          )}
        </div>
      ) : null}

      {/* ── Balance ───────────────────────────────────── */}
      {tab === "balance" ? (
        <div className="card">
          <p className="eyebrow" style={{ marginBottom: "var(--s3)" }}>収入・支出・貯金の比率</p>
          <div className="bar-stack">
            {[
              { label: "収入", value: stats?.incomeTotal ?? 0, color: "var(--jade)" },
              { label: "支出", value: stats?.expenseTotal ?? 0, color: "var(--coral)" },
              { label: "貯金", value: stats?.savingTotal ?? 0, color: "var(--amber)" }
            ].map((item) => (
              <div className="bar-row" key={item.label}>
                <span className="bar-row__label">{item.label}</span>
                <div className="prog" style={{ flex: 1 }}>
                  <div
                    className="prog__fill"
                    style={{ width: `${(item.value / maxValue) * 100}%`, background: item.color }}
                  />
                </div>
                <span className="bar-row__value">{formatCurrency(item.value)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── AI Analysis ───────────────────────────────── */}
      {tab === "analysis" ? (
        <div className="card form-stack">
          <p className="eyebrow">月次AI分析</p>
          <button className="btn btn--fill" onClick={() => void generateAnalysis()} type="button">
            分析を生成
          </button>
          {analysis ? (
            <div className="analysis-block">{analysis}</div>
          ) : (
            <EmptyState>まだ分析はありません。</EmptyState>
          )}
        </div>
      ) : null}
    </AppLayout>
  );
}
