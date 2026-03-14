import { useEffect, useMemo, useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { EmptyState } from "../components/ui";
import { apiRequest } from "../lib/api";
import { formatCurrency, formatDateTime, getPeriodIdClient, listPeriods } from "../lib/format";
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

type AnalysisItem = {
  id: string;
  month: string;
  version: number;
  content: string;
  generatedAt: string;
};

type ProgressPageProps = {
  user: AppUser;
  onLogout: () => Promise<void>;
};

export function ProgressPage({ user, onLogout }: ProgressPageProps) {
  const token = getAuthToken();
  const [stats, setStats] = useState<Stats | null>(null);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisItem[]>([]);
  const [generationCount, setGenerationCount] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [tab, setTab] = useState<"report" | "ai">("report");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const periods = useMemo(() => listPeriods(user.paydayOfMonth ?? 25), [user.paydayOfMonth]);
  const defaultPeriod = useMemo(
    () => getPeriodIdClient(new Date(), user.paydayOfMonth ?? 25),
    [user.paydayOfMonth]
  );
  const [periodId, setPeriodId] = useState(defaultPeriod);
  const selectedMonth = periodId.slice(0, 7); // "YYYY-MM"

  const loadStats = async () => {
    if (!token) return;
    const statsData = await apiRequest<Stats>("/api/users/me/stats", { token });
    setStats(statsData);
  };

  const loadRecords = async () => {
    if (!token) return;
    const recordsData = await apiRequest<{ records: RecordItem[] }>(
      `/api/records?periodId=${periodId}`,
      { token }
    );
    setRecords(recordsData.records);
  };

  const loadAnalyses = async () => {
    if (!token) return;
    const data = await apiRequest<{ analyses: AnalysisItem[]; generationCount: number }>(
      `/api/analysis?month=${selectedMonth}`,
      { token }
    ).catch(() => ({ analyses: [] as AnalysisItem[], generationCount: 0 }));
    setAnalyses(data.analyses);
    setGenerationCount(data.generationCount);
  };

  useEffect(() => {
    void loadStats();
  }, [token]);

  useEffect(() => {
    void loadRecords();
    void loadAnalyses();
  }, [token, periodId]);

  const generateAnalysis = async () => {
    if (!token || generating) return;
    setGenerating(true);
    try {
      const data = await apiRequest<{ analysis: AnalysisItem; generationCount: number }>(
        "/api/analysis/generate",
        { method: "POST", token, body: { month: selectedMonth } }
      );
      setAnalyses((prev) => [data.analysis, ...prev]);
      setGenerationCount(data.generationCount);
      setExpandedId(data.analysis.id);
    } catch (err) {
      // silently fail – error shown via alert
      window.alert(err instanceof Error ? err.message : "生成に失敗しました");
    } finally {
      setGenerating(false);
    }
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
  const currentPeriodLabel = periods.find((p) => p.id === periodId)?.label ?? periodId;

  return (
    <AppLayout onLogout={onLogout} title="進捗" user={user}>
      {/* ── Period selector ────────────────────────────── */}
      <label className="field" style={{ margin: 0 }}>
        <select
          value={periodId}
          onChange={(event) => setPeriodId(event.target.value)}
          style={{ fontWeight: 600 }}
        >
          {periods.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </label>

      {/* ── Stats ─────────────────────────────────────── */}
      <div className="four-up">
        <div className="card"><div className="stat"><p className="stat__label">収入</p><p className="stat__value stat__value--jade">{formatCurrency(stats?.incomeTotal ?? 0)}</p></div></div>
        <div className="card"><div className="stat"><p className="stat__label">支出</p><p className="stat__value stat__value--coral">{formatCurrency(stats?.expenseTotal ?? 0)}</p></div></div>
        <div className="card"><div className="stat"><p className="stat__label">貯金</p><p className="stat__value stat__value--amber">{formatCurrency(stats?.savingTotal ?? 0)}</p></div></div>
        <div className="card"><div className="stat"><p className="stat__label">記録継続</p><p className="stat__value">{stats?.streakDays ?? 0}日</p></div></div>
      </div>

      {/* ── Tab selector ──────────────────────────────── */}
      <div className="seg">
        <button
          className={`seg__btn ${tab === "report" ? "on" : ""}`}
          onClick={() => setTab("report")}
          type="button"
        >
          レポート
        </button>
        <button
          className={`seg__btn ${tab === "ai" ? "on" : ""}`}
          onClick={() => setTab("ai")}
          type="button"
        >
          AIレポート
        </button>
      </div>

      {/* ── Report tab ────────────────────────────────── */}
      {tab === "report" ? (
        <>
          {/* Expense breakdown */}
          <div className="card">
            <p className="eyebrow" style={{ marginBottom: "var(--s3)" }}>{currentPeriodLabel} · 支出カテゴリ</p>
            {topExpenseCategories.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--s3)" }}>
                {topExpenseCategories.map((item) => (
                  <div key={item.name}>
                    <div className="row row--spread" style={{ marginBottom: "var(--s1)" }}>
                      <span style={{ fontSize: "14px", fontWeight: 500 }}>{item.name}</span>
                      <span style={{ fontSize: "13px", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                        {formatCurrency(item.total)}
                      </span>
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

          {/* Balance ratio */}
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
        </>
      ) : null}

      {/* ── AI Report tab ─────────────────────────────── */}
      {tab === "ai" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s4)" }}>
          {/* Header + generate button */}
          <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--s3)" }}>
            <div>
              <p style={{ fontSize: "14px", fontWeight: 600 }}>{currentPeriodLabel} のAIレポート</p>
              <p style={{ fontSize: "12px", color: generationCount >= 3 ? "var(--coral)" : "var(--text-2)", marginTop: "2px" }}>
                今月の生成回数: {generationCount} / 3
              </p>
            </div>
            <button
              className="btn btn--fill btn--sm"
              disabled={generating || generationCount >= 3}
              onClick={() => void generateAnalysis()}
              type="button"
            >
              {generating ? "生成中..." : generationCount >= 3 ? "上限に達しました" : "新しいレポートを生成"}
            </button>
          </div>

          {/* Analysis list */}
          {analyses.length ? (
            analyses.map((analysis) => (
              <div className="card" key={analysis.id}>
                <div
                  className="row row--spread"
                  style={{ cursor: "pointer", userSelect: "none" }}
                  onClick={() => setExpandedId(expandedId === analysis.id ? null : analysis.id)}
                >
                  <div>
                    <p style={{ fontSize: "14px", fontWeight: 600 }}>
                      v{analysis.version} · {analysis.month}
                    </p>
                    <p style={{ fontSize: "12px", color: "var(--text-2)", marginTop: "2px" }}>
                      {formatDateTime(analysis.generatedAt)}
                    </p>
                  </div>
                  <span className="material-symbols-outlined" style={{ fontSize: "20px", color: "var(--text-2)" }}>
                    {expandedId === analysis.id ? "expand_less" : "expand_more"}
                  </span>
                </div>
                {expandedId === analysis.id ? (
                  <div
                    className="analysis-block"
                    style={{ marginTop: "var(--s4)", borderTop: "1px solid var(--border)", paddingTop: "var(--s4)" }}
                  >
                    {analysis.content}
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <EmptyState>
              まだAIレポートがありません。「新しいレポートを生成」で今期の分析を作成できます。
            </EmptyState>
          )}
        </div>
      ) : null}
    </AppLayout>
  );
}
