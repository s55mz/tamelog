import { useEffect, useMemo, useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { DateField } from "../components/TemporalFields";
import { Feedback } from "../components/ui";
import { apiRequest } from "../lib/api";
import { useAutoRefresh } from "../lib/autoRefresh";
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
  // Mobile: which goal row is tapped for inline detail view
  const [detailGoal, setDetailGoal] = useState<Goal | null>(null);

  useEffect(() => {
    if (detailGoal) {
      document.body.setAttribute("data-sheet", "open");
    } else {
      document.body.removeAttribute("data-sheet");
    }
    return () => { document.body.removeAttribute("data-sheet"); };
  }, [detailGoal]);

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
  useAutoRefresh(loadGoals);

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
    if (!token) return;
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
          visualCategory: selectedVisualOption?.visualCategory ?? "OTHER",
          visualSubcategory: selectedVisualOption?.visualSubcategory ?? "generic"
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
    if (!token || !selectedGoal) return;
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
          visualCategory: selectedVisualOption?.visualCategory ?? selectedGoal.visualCategory ?? "OTHER",
          visualSubcategory: selectedVisualOption?.visualSubcategory ?? selectedGoal.visualSubcategory ?? "generic"
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
    setDetailGoal(null);
    setSelectedGoal(goal);
    const matchedOption = visualOptions.find(
      (o) => o.visualCategory === goal.visualCategory && o.visualSubcategory === goal.visualSubcategory
    );
    setDraft({
      title: goal.title,
      targetAmount: String(goal.targetAmount),
      deadline: goal.deadline ?? "",
      note: goal.note ?? "",
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
    <AppLayout
      onLogout={onLogout}
      subtitle="貯める理由と進み具合を、静かに管理する画面です。"
      title="ためる"
      user={user}
    >

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
            type="button"
          >
            <span className="material-symbols-outlined">add_circle</span>
            最初の目標を追加
          </button>
        </div>
      ) : null}

      {/* ── Hero: main goal (PC only) ────────────────────── */}
      {mainGoal && !formOpen ? (
        <div className="goal-hero goal-hero--pc-only">
          <div className="goal-hero__layout">
            <div className="goal-hero__visual-column">
              <div className="goal-hero__visual-frame">
                <img
                  alt={mainGoal.visual.altText}
                  className="goal-hero__image"
                  src={mainGoal.visual.imagePath}
                />
              </div>
              {mainGoal.visual.headlineText ? (
                <div className="goal-hero__visual-note">
                  <p className="goal-hero__visual-note-text">{mainGoal.visual.headlineText}</p>
                </div>
              ) : null}
            </div>

            <div className="goal-hero__content">
              <div className="goal-hero__content-head">
                <div>
                  <p className="goal-hero__eyebrow">メイン目標</p>
                  <h2 className="goal-hero__title">{mainGoal.title}</h2>
                </div>
                <button
                  className="btn btn--out btn--sm"
                  onClick={() => openEdit(mainGoal)}
                  type="button"
                >
                  <span className="material-symbols-outlined">edit</span>
                  編集
                </button>
              </div>

              <div className="goal-hero__metric-row">
                <div className="goal-hero__metric-card">
                  <span>現在</span>
                  <strong>{formatCurrency(mainGoal.currentAmount)}</strong>
                </div>
                <div className="goal-hero__metric-card">
                  <span>残り</span>
                  <strong>{formatCurrency(mainGoal.remainingAmount)}</strong>
                </div>
                <div className="goal-hero__metric-card">
                  <span>期限</span>
                  <strong>{mainGoal.remainingDays !== null ? `${mainGoal.remainingDays}日` : "―"}</strong>
                </div>
              </div>

              <div className="goal-hero__prog-wrap">
                <div className="goal-hero__prog-bar">
                  <div
                    className="goal-hero__prog-fill"
                    style={{ width: `${Math.min(mainGoal.achievementRate, 100)}%` }}
                  />
                </div>
              </div>

              <div className="goal-hero__meta">
                <span className="goal-hero__pct">{mainGoal.achievementRate}% 達成</span>
                <span className="goal-hero__remain">目標 {formatCurrency(mainGoal.targetAmount)}</span>
              </div>

              {mainGoal.deadline || mainGoal.note ? (
                <div className="goal-hero__strip">
                  {mainGoal.deadline ? (
                    <>
                      <span className="material-symbols-outlined goal-hero__strip-icon">
                        calendar_month
                      </span>
                      <span className="goal-hero__strip-date">
                        期限: {formatDate(mainGoal.deadline)}
                      </span>
                    </>
                  ) : null}
                  {mainGoal.note ? (
                    <span className="goal-hero__strip-note">{mainGoal.note}</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Stats bar (PC only) ─────────────────────────── */}
      {goals.length > 0 && !formOpen ? (
        <div className="goal-stats-bar goal-stats-bar--pc-only">
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

      {/* ── Mobile goal list (all goals, tap for detail) ─── */}
      {goals.length > 0 && !formOpen ? (
        <div className="goal-mobile-list">
          <p className="eyebrow eyebrow--mb">目標一覧</p>
          <div className="stack-sm">
            {goals.map((goal, i) => (
              <button
                className="goal-row goal-row--tappable"
                key={goal.id}
                onClick={() => setDetailGoal(goal)}
                type="button"
              >
                <div className="goal-row__body" style={{ flex: 1 }}>
                  {i === 0 ? (
                    <span className="badge badge--save badge--xs">メイン</span>
                  ) : null}
                  <p className="goal-row__name">{goal.title}</p>
                  <p className="goal-row__sub">
                    {formatCurrency(goal.currentAmount)} / {formatCurrency(goal.targetAmount)}
                  </p>
                  <div className="goal-row__prog-wrap">
                    <div className="prog prog--orange prog--thin prog--flex">
                      <div className="prog__fill" style={{ width: `${Math.min(goal.achievementRate, 100)}%` }} />
                    </div>
                    <span className="goal-row__pct">{goal.achievementRate}%</span>
                  </div>
                </div>
                <div className="goal-row__actions">
                  <span className="material-symbols-outlined" style={{ fontSize: "18px", color: "var(--text-3)" }}>
                    chevron_right
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Other goals (PC only list) ───────────────────── */}
      {goals.length > 1 && !formOpen ? (
        <div className="goal-pc-list">
          <p className="eyebrow eyebrow--mb">すべての目標</p>
          <div className="goal-pc-grid">
            {goals.map((goal, i) => (
              <div className="goal-row" key={goal.id}>
                <div className="goal-row__body">
                  {i === 0 ? (
                    <span className="badge badge--save badge--xs">
                      メイン
                    </span>
                  ) : null}
                  <p className="goal-row__name">{goal.title}</p>
                  <p className="goal-row__sub">
                    {formatCurrency(goal.currentAmount)} / {formatCurrency(goal.targetAmount)}
                  </p>
                  <div className="goal-row__prog-wrap">
                    <div className="prog prog--orange prog--thin prog--flex">
                      <div className="prog__fill" style={{ width: `${Math.min(goal.achievementRate, 100)}%` }} />
                    </div>
                    <span className="goal-row__pct">{goal.achievementRate}%</span>
                  </div>
                </div>
                <div className="goal-row__actions">
                  <button className="btn btn--icon btn--sm" onClick={() => openEdit(goal)} type="button">
                    <span className="material-symbols-outlined">edit</span>
                  </button>
                  <button className="btn btn--del btn--icon btn--sm" onClick={() => void deleteGoal(goal.id)} type="button">
                    <span className="material-symbols-outlined">delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Single goal delete */}
      {goals.length === 1 && mainGoal && !formOpen ? (
        <div className="row row--end">
          <button className="btn btn--del btn--sm" onClick={() => void deleteGoal(mainGoal.id)} type="button">
            <span className="material-symbols-outlined">delete</span>
            削除
          </button>
        </div>
      ) : null}

      {/* ── Add button ──────────────────────────────────── */}
      {!formOpen ? (
        <button
          className="btn btn--out btn--block"
          onClick={() => {
            setSelectedGoal(null);
            setDraft({ ...initialDraft, visualOptionId: visualOptions[0]?.id ?? initialDraft.visualOptionId });
            setFormOpen(true);
          }}
          type="button"
        >
          <span className="material-symbols-outlined">add</span>
          {goals.length > 0 ? "別の目標を追加" : "目標を追加する"}
        </button>
      ) : null}

      {/* ── Form ────────────────────────────────────────── */}
      {formOpen ? (
        <div className="goal-form-shell form-stack">
          <div className="form-card__head">
            <p className="form-card__title">
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
            <DateField
              label="期限（任意）"
              onChange={(value) => setDraft({ ...draft, deadline: value })}
              value={draft.deadline}
            />
            {visualOptions.length > 0 ? (
              <label className="field">
                <span className="field__label">カテゴリ</span>
                <select value={draft.visualOptionId} onChange={(e) => setDraft({ ...draft, visualOptionId: e.target.value })}>
                  {visualOptions.map((o) => (
                    <option key={o.id} value={o.id}>{o.title}</option>
                  ))}
                </select>
              </label>
            ) : null}
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
            <div className="goal-visual-preview">
              <img
                alt={selectedVisualOption.title}
                className="goal-visual-preview__img"
                src={selectedVisualOption.imagePath}
              />
              <div className="goal-visual-preview__info">
                <p className="goal-visual-preview__title">{selectedVisualOption.title}</p>
                <p className="goal-visual-preview__comment">{selectedVisualOption.comment}</p>
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

      {detailGoal ? (
        <div
          className="goal-detail-sheet"
          onClick={() => setDetailGoal(null)}
          role="presentation"
        >
          <div
            className="goal-detail-sheet__panel"
            onClick={(event) => event.stopPropagation()}
            role="presentation"
          >
            <div className="goal-detail-sheet__handle" />
            <div className="goal-detail-sheet__head">
              <div>
                <p className="eyebrow">Goal Detail</p>
                <h2 className="goal-detail-sheet__title">{detailGoal.title}</h2>
              </div>
              <button className="btn btn--ghost btn--sm" onClick={() => setDetailGoal(null)} type="button">
                閉じる
              </button>
            </div>

            <div className="goal-detail-sheet__visual">
              <img alt={detailGoal.visual.altText} src={detailGoal.visual.imagePath} />
            </div>

            <div className="goal-detail-sheet__metrics">
              <div>
                <span>現在</span>
                <strong>{formatCurrency(detailGoal.currentAmount)}</strong>
              </div>
              <div>
                <span>残り</span>
                <strong>{formatCurrency(detailGoal.remainingAmount)}</strong>
              </div>
              <div>
                <span>達成率</span>
                <strong>{detailGoal.achievementRate}%</strong>
              </div>
              <div>
                <span>期限</span>
                <strong>{detailGoal.remainingDays !== null ? `${detailGoal.remainingDays}日` : "未設定"}</strong>
              </div>
            </div>

            <div className="goal-detail-sheet__body">
              {detailGoal.deadline ? (
                <p className="goal-detail-sheet__text">
                  期限: {formatDate(detailGoal.deadline)}
                </p>
              ) : null}
              {detailGoal.note ? (
                <p className="goal-detail-sheet__text">{detailGoal.note}</p>
              ) : null}
              <div className="prog prog--orange prog--thin prog--flex">
                <div className="prog__fill" style={{ width: `${Math.min(detailGoal.achievementRate, 100)}%` }} />
              </div>
            </div>

            <div className="goal-detail-sheet__actions">
              <button className="btn btn--fill" onClick={() => openEdit(detailGoal)} type="button">
                <span className="material-symbols-outlined">edit</span>
                編集
              </button>
              <button
                className="btn btn--del"
                onClick={() => {
                  const goalId = detailGoal.id;
                  setDetailGoal(null);
                  void deleteGoal(goalId);
                }}
                type="button"
              >
                <span className="material-symbols-outlined">delete</span>
                削除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
