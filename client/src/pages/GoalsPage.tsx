import { useEffect, useMemo, useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { Feedback } from "../components/ui";
import { apiRequest } from "../lib/api";
import { formatCurrency, formatDate } from "../lib/format";
import { getAuthToken } from "../lib/storage";
import { useToast } from "../lib/toast";
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
  const toast = useToast();
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
    setDraft((c) => ({ ...c, visualOptionId: c.visualOptionId || data.options[0]?.id || initialDraft.visualOptionId }));
  };

  const loadGoals = async () => {
    if (!token) return;
    const data = await apiRequest<{ goals: Goal[] }>("/api/goals", { token });
    setGoals(data.goals);
    setSelectedGoal((c) => (c ? data.goals.find((g) => g.id === c.id) ?? null : null));
  };

  useEffect(() => {
    void loadVisualOptions();
    void loadGoals();
  }, [token]);

  const resetDraft = () => {
    setDraft({ ...initialDraft, visualOptionId: visualOptions[0]?.id ?? initialDraft.visualOptionId });
    setSelectedGoal(null);
    setFormOpen(false);
    setError("");
  };

  const selectedVisualOption = useMemo(
    () => visualOptions.find((o) => o.id === draft.visualOptionId) ?? visualOptions[0] ?? null,
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
      toast("目標を追加しました");
      resetDraft();
      await loadGoals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
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
      toast("目標を更新しました");
      resetDraft();
      await loadGoals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新に失敗しました");
    }
  };

  const deleteGoal = async (goalId: string) => {
    if (!token) return;
    await apiRequest(`/api/goals/${goalId}`, { method: "DELETE", token });
    toast("削除しました");
    if (selectedGoal?.id === goalId) resetDraft();
    await loadGoals();
  };

  const openEdit = (goal: Goal) => {
    setSelectedGoal(goal);
    const matchedOption = visualOptions.find(
      (o) => o.visualCategory === goal.visualCategory && o.visualSubcategory === goal.visualSubcategory
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
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const mainGoal = goals[0] ?? null;
  const totalCurrent = goals.reduce((s, g) => s + g.currentAmount, 0);
  const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0);
  const overallRate = totalTarget > 0 ? Math.floor((totalCurrent / totalTarget) * 100) : 0;

  return (
    <AppLayout onLogout={onLogout} title="ためる" user={user}>

      {/* ── Empty state ─────────────────────────────────── */}
      {goals.length === 0 && !formOpen ? (
        <div className="goal-empty">
          <div className="goal-empty__icon">
            <span className="material-symbols-outlined">savings</span>
          </div>
          <h2 className="goal-empty__title">目標を設定しよう</h2>
          <p className="goal-empty__sub">
            貯めたいものを決めると、<br />毎日の記録が楽しくなります
          </p>
          <button
            className="btn btn--fill"
            onClick={() => setFormOpen(true)}
            style={{ gap: "var(--s2)" }}
            type="button"
          >
            <span className="material-symbols-outlined">add_circle</span>
            最初の目標を追加
          </button>
        </div>
      ) : null}

      {/* ── Hero: main goal ─────────────────────────────── */}
      {mainGoal && !formOpen ? (
        <div className="goal-hero">
          <div className="goal-hero__image-wrap">
            <img
              alt={mainGoal.visual.altText}
              className="goal-hero__image"
              src={mainGoal.visual.imagePath}
            />
            <div className="goal-hero__overlay" />
            <div className="goal-hero__caption">
              <p className="goal-hero__eyebrow">メイン目標</p>
              <h2 className="goal-hero__title">{mainGoal.title}</h2>
              <div className="goal-hero__prog-wrap">
                <div className="goal-hero__prog-bar">
                  <div
                    className="goal-hero__prog-fill"
                    style={{ width: `${Math.min(mainGoal.achievementRate, 100)}%` }}
                  />
                </div>
              </div>
              <div className="goal-hero__meta">
                <span className="goal-hero__pct">{mainGoal.achievementRate}%</span>
                <span className="goal-hero__remain">
                  残り {formatCurrency(mainGoal.remainingAmount)}
                  {mainGoal.remainingDays !== null ? ` · ${mainGoal.remainingDays}日` : ""}
                </span>
              </div>
            </div>
            <button
              className="goal-hero__edit-btn"
              onClick={() => openEdit(mainGoal)}
              type="button"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>edit</span>
              編集
            </button>
          </div>

          {mainGoal.deadline || mainGoal.note ? (
            <div className="goal-hero__strip">
              {mainGoal.deadline ? (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: "13px", color: "var(--text-3)", flexShrink: 0 }}>
                    calendar_month
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--text-2)", flexShrink: 0 }}>
                    期限: {formatDate(mainGoal.deadline)}
                  </span>
                </>
              ) : null}
              {mainGoal.note ? (
                <span style={{ fontSize: "12px", color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {mainGoal.deadline ? " · " : ""}{mainGoal.note}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Stats bar ───────────────────────────────────── */}
      {goals.length > 0 && !formOpen ? (
        <div className="goal-stats-bar">
          <div className="goal-stats-bar__item">
            <span className="goal-stats-bar__label">合計貯金</span>
            <span className="goal-stats-bar__value">{formatCurrency(totalCurrent)}</span>
          </div>
          <div className="goal-stats-bar__divider" />
          <div className="goal-stats-bar__item">
            <span className="goal-stats-bar__label">合計目標</span>
            <span className="goal-stats-bar__value">{formatCurrency(totalTarget)}</span>
          </div>
          <div className="goal-stats-bar__divider" />
          <div className="goal-stats-bar__item">
            <span className="goal-stats-bar__label">達成率</span>
            <span className="goal-stats-bar__value goal-stats-bar__value--accent">{overallRate}%</span>
          </div>
        </div>
      ) : null}

      {/* ── Other goals ─────────────────────────────────── */}
      {goals.length > 1 && !formOpen ? (
        <div>
          <p className="eyebrow" style={{ marginBottom: "var(--s3)" }}>すべての目標</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s2)" }}>
            {goals.map((goal, i) => (
              <div className="goal-row" key={goal.id}>
                <div className="goal-row__img-wrap">
                  <img alt={goal.visual.altText} className="goal-row__img" src={goal.visual.imagePath} />
                </div>
                <div className="goal-row__body">
                  {i === 0 ? (
                    <span className="badge badge--save" style={{ marginBottom: "3px", display: "inline-block", fontSize: "9px" }}>
                      メイン
                    </span>
                  ) : null}
                  <p className="goal-row__name">{goal.title}</p>
                  <p className="goal-row__sub">
                    {formatCurrency(goal.currentAmount)} / {formatCurrency(goal.targetAmount)}
                  </p>
                  <div className="goal-row__prog-wrap">
                    <div className="prog prog--orange" style={{ flex: 1, height: "3px" }}>
                      <div className="prog__fill" style={{ width: `${Math.min(goal.achievementRate, 100)}%` }} />
                    </div>
                    <span className="goal-row__pct">{goal.achievementRate}%</span>
                  </div>
                </div>
                <div className="goal-row__actions">
                  <button className="btn btn--icon btn--sm" onClick={() => openEdit(goal)} type="button">
                    <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>edit</span>
                  </button>
                  <button className="btn btn--del btn--icon btn--sm" onClick={() => void deleteGoal(goal.id)} type="button">
                    <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Single goal delete */}
      {goals.length === 1 && mainGoal && !formOpen ? (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn--del btn--sm" onClick={() => void deleteGoal(mainGoal.id)} type="button">
            <span className="material-symbols-outlined" style={{ fontSize: "15px" }}>delete</span>
            削除
          </button>
        </div>
      ) : null}

      {/* ── Add button ──────────────────────────────────── */}
      {!formOpen ? (
        <button
          className="btn btn--out"
          onClick={() => {
            setSelectedGoal(null);
            setDraft({ ...initialDraft, visualOptionId: visualOptions[0]?.id ?? initialDraft.visualOptionId });
            setFormOpen(true);
          }}
          style={{ width: "100%", gap: "var(--s2)" }}
          type="button"
        >
          <span className="material-symbols-outlined">add</span>
          {goals.length > 0 ? "別の目標を追加" : "目標を追加する"}
        </button>
      ) : null}

      {/* ── Form ────────────────────────────────────────── */}
      {formOpen ? (
        <div className="card form-stack">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p style={{ fontSize: "16px", fontWeight: 700, fontFamily: "'Playfair Display', Georgia, serif" }}>
              {selectedGoal ? "目標を編集" : "新しい目標"}
            </p>
            <button className="btn btn--icon btn--sm" onClick={resetDraft} type="button">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <div className="form-grid">
            <label className="field field--wide">
              <span className="field__label">目標名</span>
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="例: 新しいMacBook"
              />
            </label>
            <label className="field">
              <span className="field__label">目標金額</span>
              <input
                type="number"
                value={draft.targetAmount}
                onChange={(e) => setDraft({ ...draft, targetAmount: e.target.value })}
                placeholder="0"
              />
            </label>
            <label className="field">
              <span className="field__label">期限（任意）</span>
              <input type="date" value={draft.deadline} onChange={(e) => setDraft({ ...draft, deadline: e.target.value })} />
            </label>
            <label className="field">
              <span className="field__label">ビジュアル</span>
              <select value={draft.visualOptionId} onChange={(e) => setDraft({ ...draft, visualOptionId: e.target.value })}>
                {visualOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.title}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">テーマ</span>
              <select value={draft.visualTheme} onChange={(e) => setDraft({ ...draft, visualTheme: e.target.value })}>
                <option value="SOFT">Soft</option>
                <option value="POP">Pop</option>
                <option value="CALM">Calm</option>
              </select>
            </label>
            <label className="field field--wide">
              <span className="field__label">メモ（任意）</span>
              <textarea
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                placeholder="なぜこれを貯めるか..."
              />
            </label>
          </div>

          {selectedVisualOption ? (
            <div style={{ display: "flex", gap: "var(--s3)", padding: "var(--s3)", background: "var(--bg-2)", borderRadius: "var(--r3)", border: "1px solid var(--border)" }}>
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
            <button
              className="btn btn--fill"
              onClick={() => void (selectedGoal ? updateGoal() : createGoal())}
              type="button"
            >
              {selectedGoal ? "更新する" : "追加する"}
            </button>
            <button className="btn btn--out" onClick={resetDraft} type="button">
              キャンセル
            </button>
          </div>
          {error ? <Feedback kind="err">{error}</Feedback> : null}
        </div>
      ) : null}
    </AppLayout>
  );
}
