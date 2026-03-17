import { useEffect, useMemo, useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { Markdown } from "../components/Markdown";
import { LoadingSpinner, EmptyState } from "../components/ui";
import { apiRequest } from "../lib/api";
import { formatCurrency, formatDateTime, getPeriodIdClient, listPeriods } from "../lib/format";
import { getAuthToken } from "../lib/storage";
import type { AppUser } from "../lib/types";

type AnalysisItem = {
  id: string;
  month: string;
  version: number;
  content: string;
  generatedAt: string;
};

type ReportSummary = {
  periodId: string;
  summary: {
    income: number;
    expense: number;
    saving: number;
    balance: number;
    savingRate: number;
    expenseRate: number;
    transactionCount: number;
    averageExpense: number;
    largestExpense: number;
  };
  categoryBreakdown: Array<{ category: string; amount: number; percentage: number }>;
  topExpenses: Array<{ id: string; date: string; amount: number; memo: string; category: string }>;
  emotionBreakdown: Array<{ emotion: string; count: number; totalAmount: number }>;
  accounts: Array<{ name: string; type: string; balance: number; isPrimary: boolean }>;
  trend: Array<{
    periodId: string;
    label: string;
    income: number;
    expense: number;
    saving: number;
    balance: number;
  }>;
};

type ProgressPageProps = {
  user: AppUser;
  onLogout: () => Promise<void>;
};

const DONUT_COLORS = ["var(--brand)", "var(--danger)", "var(--amber)", "var(--info)", "#0F766E"];

function DonutChart({
  centerLabel,
  centerValue,
  items
}: {
  centerLabel: string;
  centerValue: string;
  items: { name: string; total: number; color: string }[];
}) {
  const total = items.reduce((sum, item) => sum + item.total, 0);
  if (!total) return null;

  let offset = 0;
  const radius = 56;
  const circumference = 2 * Math.PI * radius;

  return (
    <div style={{ display: "flex", gap: "24px", alignItems: "center", flexWrap: "wrap" }}>
      <svg width="160" height="160" viewBox="0 0 160 160" aria-hidden="true">
        <circle cx="80" cy="80" fill="none" r={radius} stroke="var(--bg-3)" strokeWidth="24" />
        {items.map((item) => {
          const pct = item.total / total;
          const dash = pct * circumference;
          const gap = circumference - dash;
          const rotate = offset * 360 - 90;
          offset += pct;
          return (
            <circle
              key={item.name}
              cx="80"
              cy="80"
              fill="none"
              r={radius}
              stroke={item.color}
              strokeDasharray={`${dash} ${gap}`}
              strokeLinecap="butt"
              strokeWidth="24"
              style={{ transform: `rotate(${rotate}deg)`, transformOrigin: "80px 80px" }}
            />
          );
        })}
        <text x="80" y="74" textAnchor="middle" fontSize="11" fill="var(--text-3)" fontWeight="700">
          {centerLabel}
        </text>
        <text x="80" y="94" textAnchor="middle" fontSize="13" fill="var(--text)" fontWeight="700" fontFamily="monospace">
          {centerValue}
        </text>
      </svg>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px", flex: 1, minWidth: "200px" }}>
        {items.map((item) => (
          <div key={item.name} style={{ display: "grid", gridTemplateColumns: "12px 1fr auto auto", gap: "8px", alignItems: "center" }}>
            <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: item.color }} />
            <span style={{ fontSize: "13px", color: "var(--text-2)" }}>{item.name}</span>
            <span className="text-amount">{formatCurrency(item.total)}</span>
            <span className="text-xs">{Math.round((item.total / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendBars({ items }: { items: ReportSummary["trend"] }) {
  const maxValue = Math.max(
    ...items.flatMap((item) => [item.income, item.expense, item.saving, Math.abs(item.balance)]),
    1
  );

  return (
    <div className="stack-sm">
      {items.slice().reverse().map((item) => (
        <div key={item.periodId} className="card" style={{ background: "var(--bg-2)" }}>
          <div className="row row--spread row--mb-xs">
            <strong style={{ fontSize: "13px" }}>{item.label}</strong>
            <span className={`badge ${item.balance >= 0 ? "badge--in" : "badge--out"}`}>
              {item.balance >= 0 ? "黒字" : "赤字"} {formatCurrency(Math.abs(item.balance))}
            </span>
          </div>
          <div className="stack-sm">
            {[
              { label: "収入", value: item.income, color: "var(--brand)" },
              { label: "支出", value: item.expense, color: "var(--danger)" },
              { label: "貯金", value: item.saving, color: "var(--amber)" }
            ].map((bar) => (
              <div key={`${item.periodId}-${bar.label}`} className="bar-row">
                <span className="bar-row__label">{bar.label}</span>
                <div className="prog prog--flex">
                  <div className="prog__fill" style={{ width: `${(bar.value / maxValue) * 100}%`, background: bar.color }} />
                </div>
                <span className="bar-row__value">{formatCurrency(bar.value)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProgressPage({ user, onLogout }: ProgressPageProps) {
  const token = getAuthToken();
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
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
  const selectedMonth = periodId;

  useEffect(() => {
    if (!token) return;
    setReportLoading(true);
    apiRequest<ReportSummary>(`/api/analysis/summary?month=${periodId}`, { token })
      .then(setReport)
      .catch(() => setReport(null))
      .finally(() => setReportLoading(false));
  }, [token, periodId]);

  useEffect(() => {
    if (!token) return;
    apiRequest<{ analyses: AnalysisItem[]; generationCount: number }>(
      `/api/analysis?month=${selectedMonth}`,
      { token }
    )
      .then((data) => {
        setAnalyses(data.analyses);
        setGenerationCount(data.generationCount);
      })
      .catch(() => {
        setAnalyses([]);
        setGenerationCount(0);
      });
  }, [token, selectedMonth]);

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
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "生成に失敗しました");
    } finally {
      setGenerating(false);
    }
  };

  const currentPeriodLabel = periods.find((period) => period.id === periodId)?.label ?? periodId;
  const categoryItems = report?.categoryBreakdown.slice(0, 5).map((item, index) => ({
    name: item.category,
    total: item.amount,
    color: DONUT_COLORS[index] ?? "var(--text-3)"
  })) ?? [];

  const moneyFlowItems = report
    ? [
        { name: "収入", total: report.summary.income, color: "var(--brand)" },
        { name: "支出", total: report.summary.expense, color: "var(--danger)" },
        { name: "貯金", total: report.summary.saving, color: "var(--amber)" }
      ].filter((item) => item.total > 0)
    : [];

  const topCategory = report?.categoryBreakdown[0];

  return (
    <AppLayout
      onLogout={onLogout}
      subtitle="収支、偏り、直近の流れを同じ基準で見返します。"
      title="進捗"
      user={user}
    >
      <label className="field field--compact">
        <select value={periodId} onChange={(event) => setPeriodId(event.target.value)}>
          {periods.map((period) => (
            <option key={period.id} value={period.id}>
              {period.label}
            </option>
          ))}
        </select>
      </label>

      <div className="seg">
        <button className={`seg__btn ${tab === "report" ? "on" : ""}`} onClick={() => setTab("report")} type="button">
          レポート
        </button>
        <button className={`seg__btn ${tab === "ai" ? "on" : ""}`} onClick={() => setTab("ai")} type="button">
          AIレポート
        </button>
      </div>

      {tab === "report" ? (
        reportLoading ? (
          <div className="card card--center">
            <LoadingSpinner label="レポートを集計しています" />
          </div>
        ) : report ? (
          <div className="stack-md">
            <div className="four-up">
              <div className="card"><div className="stat"><p className="stat__label">収入</p><p className="stat__value stat__value--jade">{formatCurrency(report.summary.income)}</p></div></div>
              <div className="card"><div className="stat"><p className="stat__label">支出</p><p className="stat__value stat__value--coral">{formatCurrency(report.summary.expense)}</p></div></div>
              <div className="card"><div className="stat"><p className="stat__label">貯金</p><p className="stat__value stat__value--amber">{formatCurrency(report.summary.saving)}</p></div></div>
              <div className="card"><div className="stat"><p className="stat__label">収支差額</p><p className={`stat__value ${report.summary.balance >= 0 ? "stat__value--jade" : "stat__value--coral"}`}>{formatCurrency(report.summary.balance)}</p></div></div>
            </div>

            <div className="card card--row" style={{ alignItems: "stretch" }}>
              <div className="stack-sm" style={{ minWidth: "220px" }}>
                <p className="eyebrow">期間</p>
                <p className="stat__value stat__value--lg">{currentPeriodLabel}</p>
                <p className="text-sm">記録件数 {report.summary.transactionCount} 件</p>
              </div>
              <div className="stack-sm" style={{ minWidth: "180px" }}>
                <p className="eyebrow">指標</p>
                <p className="text-sm">貯蓄率 {report.summary.savingRate}%</p>
                <p className="text-sm">支出率 {report.summary.expenseRate}%</p>
                <p className="text-sm">平均支出 {formatCurrency(report.summary.averageExpense)}</p>
                <p className="text-sm">最大支出 {formatCurrency(report.summary.largestExpense)}</p>
              </div>
              <div className="stack-sm" style={{ minWidth: "220px" }}>
                <p className="eyebrow">いちばん大きい偏り</p>
                <p className="text-title">{topCategory?.category ?? "まだありません"}</p>
                <p className="text-sm">{topCategory ? `${formatCurrency(topCategory.amount)} / ${topCategory.percentage}%` : "支出が入ると表示されます"}</p>
              </div>
            </div>

            <div className="two-up">
              <div className="card">
                <p className="eyebrow eyebrow--mb">収支構成</p>
                {moneyFlowItems.length ? (
                  <DonutChart centerLabel="収支" centerValue={`${moneyFlowItems.length}区分`} items={moneyFlowItems} />
                ) : (
                  <EmptyState>まだ集計対象がありません。</EmptyState>
                )}
              </div>

              <div className="card">
                <p className="eyebrow eyebrow--mb">支出カテゴリ円グラフ</p>
                {categoryItems.length ? (
                  <DonutChart centerLabel="支出" centerValue={`${categoryItems.length}分類`} items={categoryItems} />
                ) : (
                  <EmptyState>支出カテゴリがまだありません。</EmptyState>
                )}
              </div>
            </div>

            <div className="card">
              <p className="eyebrow eyebrow--mb">直近3期の比較</p>
              <TrendBars items={report.trend} />
            </div>

            <div className="two-up">
              <div className="card">
                <p className="eyebrow eyebrow--mb">高額支出</p>
                {report.topExpenses.length ? (
                  <div className="stack-sm">
                    {report.topExpenses.map((item) => (
                      <div key={item.id} className="mini-row">
                        <div className="mini-row__body">
                          <strong>{item.memo || item.category}</strong>
                          <p className="text-meta">{item.date} · {item.category}</p>
                        </div>
                        <strong className="text-amount">{formatCurrency(item.amount)}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState>高額支出はまだありません。</EmptyState>
                )}
              </div>

              <div className="card">
                <p className="eyebrow eyebrow--mb">感情メモと支出</p>
                {report.emotionBreakdown.length ? (
                  <div className="stack-sm">
                    {report.emotionBreakdown.slice(0, 5).map((item) => (
                      <div key={item.emotion}>
                        <div className="row row--spread row--mb-xs">
                          <span className="text-label">{item.emotion}</span>
                          <span className="text-amount">{formatCurrency(item.totalAmount)}</span>
                        </div>
                        <p className="text-xs">{item.count} 件で記録</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState>感情付きの支出記録はまだありません。</EmptyState>
                )}
              </div>
            </div>

            <div className="card">
              <p className="eyebrow eyebrow--mb">口座残高</p>
              <div className="stack-sm">
                {report.accounts.map((account) => (
                  <div className="mini-row" key={account.name}>
                    <div className="mini-row__body">
                      <strong>{account.name}</strong>
                      <p className="text-meta">{account.type}{account.isPrimary ? " · メイン" : ""}</p>
                    </div>
                    <strong className="text-amount">{formatCurrency(account.balance)}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <EmptyState>集計データを読み込めませんでした。</EmptyState>
        )
      ) : null}

      {tab === "ai" ? (
        <div className="stack-md">
          <div className="card card--row">
            <div>
              <p className="text-title">{currentPeriodLabel} のAIレポート</p>
              <p className={`text-meta${generationCount >= 3 ? " text-meta--warn" : ""}`}>
                今月の生成回数: {generationCount} / 3
              </p>
              <p className="text-xs">前回レポート、直近3期、プロフィール要約を圧縮して比較に使います。</p>
            </div>
            <button
              className="btn btn--fill btn--sm"
              disabled={generating || generationCount >= 3}
              onClick={() => void generateAnalysis()}
              type="button"
            >
              {generating ? <LoadingSpinner label="生成中" /> : generationCount >= 3 ? "上限に達しました" : "新しいレポートを生成"}
            </button>
          </div>

          {generating ? (
            <div className="card card--center">
              <LoadingSpinner label="AI が比較レポートを生成しています" />
            </div>
          ) : null}

          {analyses.length ? (
            analyses.map((analysis) => (
              <div className="card" key={analysis.id}>
                <div className="row row--spread clickable" onClick={() => setExpandedId(expandedId === analysis.id ? null : analysis.id)}>
                  <div>
                    <p className="text-title">v{analysis.version} · {analysis.month}</p>
                    <p className="text-meta">{formatDateTime(analysis.generatedAt)}</p>
                  </div>
                  <span className="material-symbols-outlined icon-sm">{expandedId === analysis.id ? "expand_less" : "expand_more"}</span>
                </div>
                {expandedId === analysis.id ? (
                  <div className="analysis-block analysis-block--bordered">
                    <Markdown text={analysis.content} />
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <EmptyState>まだAIレポートがありません。「新しいレポートを生成」で今期の比較分析を作成できます。</EmptyState>
          )}
        </div>
      ) : null}
    </AppLayout>
  );
}
