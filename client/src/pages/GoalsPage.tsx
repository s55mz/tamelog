import { useEffect, useMemo, useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { EmptyState, Feedback } from "../components/ui";
import { apiRequest } from "../lib/api";
import { formatCurrency, formatDate } from "../lib/format";
import { getAuthToken } from "../lib/storage";
import type { AppUser } from "../lib/types";

type GoalVisual = { headlineText: string; imagePath: string; altText: string };

type Goal = {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  achievementRate: number;
  remainingAmount: number;
  remainingDays: number | null;
  deadline: string | null;
  note?: string | null;
  visualCategory: string;
  visualSubcategory: string;
  visualTheme: string;
  visual: GoalVisual;
};

type GoalVisualOption = {
  id: string;
  title: string;
  visualCategory: string;
  visualSubcategory: string;
  imagePath: string;
  comment: string;
  promptLabel: string;
};

type GoalsPageProps = {
  user: AppUser;
  onLogout: () => Promise<void>;
};

const initialDraft = {
  title: "",
  targetAmount: "",
  deadline: "",
  note: "",
  visualTheme: "SOFT",
  visualOptionId: "fallback:other"
};

export function GoalsPage({ user, onLogout }: GoalsPageProps) {
  const token = getAuthToken();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [visualOptions, setVisualOptions] = useState<GoalVisualOption[]>([]);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [draft, setDraft] = useState(initialDraft);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const loadVisualOptions = async () => {
    if (!token) return;
    const data = await apiRequest<{ options: GoalVisualOption[] }>("/api/goals/visual-options", { token });
    setVisualOptions(data.options);
    setDraft((current) => ({
      ...current,
      visualOptionId: current.visualOptionId || data.options[0]?.id || initialDraft.visualOptionId
    }));
  };

  const loadGoals = async () => {
    if (!token) return;
    const data = await apiRequest<{ goals: Goal[] }>("/api/goals", { token });
    setGoals(data.goals);
    setSelectedGoal((current) => (current ? data.goals.find((g) => g.id === current.id) ?? null : null));
  };

  useEffect(() => {
    void loadVisualOptions();
    void loadGoals();
  }, [token]);

  const resetDraft = () => {
    setDraft({ ...initialDraft, visualOptionId: visualOptions[0]?.id ?? initialDraft.visualOptionId });
    setSelectedGoal(null);
    setFormOpen(false);
  };

  const selectedVisualOption = useMemo(
    () => visualOptions.find((option) => option.id === draft.visualOptionId) ?? visualOptions[0] ?? null,
    [draft.visualOptionId, visualOptions]
  );

  const createGoal = async () => {
    if (!token || !selectedVisualOption) return;
    setError("");
    try {
      await apiRequest("/api/goals", {
        method: "POST",
        token,
        body: {
          title: draft.title,
          targetAmount: Number(draft.targetAmount),
          deadline: draft.deadline || undefined,
          note: draft.note || undefined,
          visualTheme: draft.visualTheme,
          visualCategory: selectedVisualOption.visualCategory,
          visualSubcategory: selectedVisualOption.visualSubcategory
        }
      });
      resetDraft();
      await loadGoals();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "保存に失敗しました");
    }
  };

  const updateGoal = async () => {
    if (!token || !selectedGoal || !selectedVisualOption) return;
    setError("");
    try {
      await apiRequest(`/api/goals/${selectedGoal.id}`, {
        method: "PUT",
        token,
        body: {
          title: draft.title || selectedGoal.title,
          targetAmount: Number(draft.targetAmount || selectedGoal.targetAmount),
          deadline: draft.deadline || selectedGoal.deadline,
          note: draft.note,
          visualTheme: draft.visualTheme,
          visualCategory: selectedVisualOption.visualCategory,
          visualSubcategory: selectedVisualOption.visualSubcategory
        }
      });
      resetDraft();
      await loadGoals();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "更新に失敗しました");
    }
  };

  const deleteGoal = async (goalId: string) => {
    if (!token) return;
    await apiRequest(`/api/goals/${goalId}`, { method: "DELETE", token });
    if (selectedGoal?.id === goalId) resetDraft();
    await loadGoals();
  };

  const openEdit = (goal: Goal) => {
    setSelectedGoal(goal);
    const matchedOption = visualOptions.find(
      (opt) => opt.visualCategory === goal.visualCategory && opt.visualSubcategory === goal.visualSubcategory
    );
    setDraft({
      title: goal.title,
      targetAmount: String(goal.targetAmount),
      deadline: goal.deadline ?? "",
      note: goal.note ?? "",
      visualTheme: goal.visualTheme,
      visualOptionId: matchedOption?.id ?? visualOptions[0]?.id ?? initialDraft.visualOptionId
    });
    setFormOpen(true);
  };

  const mainGoal = goals[0] ?? null;
  const totalCurrent = goals.reduce((sum, g) => sum + g.currentAmount, 0);
  const totalTarget = goals.reduce((sum, g) => sum + g.targetAmount, 0);
  const overallRate = totalTarget > 0 ? Math.floor((totalCurrent / totalTarget) * 100) : 0;

  return (
    <AppLayout onLogout={onLogout} title="目標" user={user}>
      {/* ── Main goal hero ─────────────────────────────── */}
      {mainGoal ? (
        <div className="card">
          <p className="eyebrow" style={{ marginBottom: "var(--s4)" }}>メイン目標</p>
          <div
            style={{
              display: "flex",
              gap: "var(--s6)",
              alignItems: "flex-start",
              flexWrap: "wrap",
              justifyContent: "center"
            }}
          >
            {/* Image + caption */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                flex: "0 0 auto",
                width: "clamp(160px, 38%, 220px)"
              }}
            >
              <img
                alt={mainGoal.visual.altText}
                src={mainGoal.visual.imagePath}
                style={{
                  width: "100%",
                  height: "auto",
                  borderRadius: "var(--r3)",
                  objectFit: "contain",
                  display: "block"
                }}
              />
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text-2)",
                  marginTop: "var(--s2)",
                  textAlign: "center",
                  lineHeight: 1.5
                }}
              >
                {mainGoal.visual.headlineText}
              </p>
            </div>

            {/* Details */}
            <div style={{ flex: 1, minWidth: "200px" }}>
              <p
                style={{
                  fontSize: "22px",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  marginBottom: "var(--s3)"
                }}
              >
                {mainGoal.title}
              </p>
              <div className="prog prog--orange" style={{ height: "8px", marginBottom: "var(--s3)" }}>
                <div className="prog__fill" style={{ width: `${Math.min(mainGoal.achievementRate, 100)}%` }} />
              </div>
              <div className="row row--spread" style={{ marginBottom: "var(--s3)" }}>
                <span style={{ fontSize: "28px", fontWeight: 700, color: "var(--amber)" }}>
                  {mainGoal.achievementRate}%
                </span>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: "14px", fontWeight: 600 }}>
                    {formatCurrency(mainGoal.currentAmount)} / {formatCurrency(mainGoal.targetAmount)}
                  </p>
                  <p style={{ fontSize: "12px", color: "var(--text-2)", marginTop: "2px" }}>
                    残り {formatCurrency(mainGoal.remainingAmount)}
                    {mainGoal.remainingDays !== null ? ` · ${mainGoal.remainingDays}日` : ""}
                  </p>
                </div>
              </div>
              {mainGoal.deadline ? (
                <p style={{ fontSize: "13px", color: "var(--text-2)" }}>
                  期限: {formatDate(mainGoal.deadline)}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Stats row ──────────────────────────────────── */}
      {goals.length > 0 ? (
        <div className="three-up">
          <div className="card"><div className="stat"><p className="stat__label">合計貯金</p><p className="stat__value">{formatCurrency(totalCurrent)}</p></div></div>
          <div className="card"><div className="stat"><p className="stat__label">合計目標</p><p className="stat__value">{formatCurrency(totalTarget)}</p></div></div>
          <div className="card"><div className="stat"><p className="stat__label">総達成率</p><p className="stat__value stat__value--amber">{overallRate}%</p></div></div>
        </div>
      ) : null}

      {/* ── Add / Edit form ────────────────────────────── */}
      <div>
        <div className="row row--spread" style={{ marginBottom: "var(--s3)" }}>
          <p className="eyebrow">{selectedGoal ? "目標を編集" : "目標を追加"}</p>
          {!formOpen ? (
            <button className="btn btn--fill btn--sm" onClick={() => setFormOpen(true)} type="button">
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>add</span>
              追加
            </button>
          ) : null}
        </div>

        {formOpen ? (
          <div className="card form-stack">
            <div className="form-grid">
              <label className="field">
                <span className="field__label">目標名</span>
                <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
              </label>
              <label className="field">
                <span className="field__label">目標金額</span>
                <input type="number" value={draft.targetAmount} onChange={(event) => setDraft({ ...draft, targetAmount: event.target.value })} />
              </label>
              <label className="field">
                <span className="field__label">期限</span>
                <input type="date" value={draft.deadline} onChange={(event) => setDraft({ ...draft, deadline: event.target.value })} />
              </label>
              <label className="field">
                <span className="field__label">ビジュアル</span>
                <select value={draft.visualOptionId} onChange={(event) => setDraft({ ...draft, visualOptionId: event.target.value })}>
                  {visualOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.title}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">テーマ</span>
                <select value={draft.visualTheme} onChange={(event) => setDraft({ ...draft, visualTheme: event.target.value })}>
                  <option value="SOFT">Soft</option>
                  <option value="POP">Pop</option>
                  <option value="CALM">Calm</option>
                </select>
              </label>
              <label className="field field--wide">
                <span className="field__label">メモ</span>
                <textarea value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} />
              </label>
            </div>

            {selectedVisualOption ? (
              <div className="row" style={{ gap: "var(--s3)", padding: "var(--s3)", background: "var(--bg-2)", borderRadius: "var(--r2)", border: "1px solid var(--border)" }}>
                <img
                  alt={selectedVisualOption.title}
                  src={selectedVisualOption.imagePath}
                  style={{ width: 56, height: 56, borderRadius: "var(--r2)", objectFit: "contain", background: "var(--bg-3)", padding: "var(--s1)", flexShrink: 0 }}
                />
                <div>
                  <p style={{ fontSize: "14px", fontWeight: 600 }}>{selectedVisualOption.title}</p>
                  <p style={{ fontSize: "12px", color: "var(--text-2)", marginTop: "2px" }}>{selectedVisualOption.comment}</p>
                </div>
              </div>
            ) : null}

            <div className="btn-row">
              <button className="btn btn--fill" onClick={() => void (selectedGoal ? updateGoal() : createGoal())} type="button">
                {selectedGoal ? "更新する" : "追加する"}
              </button>
              <button className="btn btn--out" onClick={resetDraft} type="button">
                キャンセル
              </button>
            </div>
            {error ? <Feedback kind="err">{error}</Feedback> : null}
          </div>
        ) : null}
      </div>

      {/* ── Goal list ──────────────────────────────────── */}
      <div>
        <p className="eyebrow" style={{ marginBottom: "var(--s3)" }}>すべての目標</p>
        {goals.length ? (
          <div className="entry-list">
            {goals.map((goal) => (
              <div className="card" key={goal.id} style={{ padding: "var(--s4)" }}>
                <div style={{ display: "flex", gap: "var(--s4)", alignItems: "flex-start" }}>
                  {/* Thumbnail + caption */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 88 }}>
                    <img
                      alt={goal.visual.altText}
                      src={goal.visual.imagePath}
                      style={{ width: 88, height: 88, objectFit: "contain", borderRadius: "var(--r2)", display: "block" }}
                    />
                    <p style={{ fontSize: "10px", color: "var(--text-3)", marginTop: "4px", textAlign: "center", lineHeight: 1.3 }}>
                      {goal.visual.headlineText}
                    </p>
                  </div>

                  {/* Body */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "15px", fontWeight: 600, marginBottom: "2px" }}>{goal.title}</p>
                    <p style={{ fontSize: "13px", color: "var(--text-2)", marginBottom: "var(--s2)" }}>
                      {formatCurrency(goal.currentAmount)} / {formatCurrency(goal.targetAmount)}
                    </p>
                    {goal.deadline ? (
                      <p style={{ fontSize: "12px", color: "var(--text-3)", marginBottom: "var(--s2)" }}>
                        期限 {formatDate(goal.deadline)}
                        {goal.remainingDays !== null ? ` · 残り ${goal.remainingDays}日` : ""}
                      </p>
                    ) : null}
                    <div className="prog prog--orange" style={{ marginBottom: "var(--s2)" }}>
                      <div className="prog__fill" style={{ width: `${Math.min(goal.achievementRate, 100)}%` }} />
                    </div>
                    <div style={{ display: "flex", gap: "var(--s2)", alignItems: "center" }}>
                      <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--amber)" }}>
                        {goal.achievementRate}%
                      </span>
                      <span style={{ flex: 1 }} />
                      <button className="btn btn--out btn--sm" onClick={() => openEdit(goal)} type="button">
                        編集
                      </button>
                      <button className="btn btn--del btn--sm" onClick={() => void deleteGoal(goal.id)} type="button">
                        削除
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>まだ目標がありません。追加ボタンから作成してください。</EmptyState>
        )}
      </div>
    </AppLayout>
  );
}
