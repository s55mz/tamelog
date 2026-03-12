import { useEffect, useMemo, useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { apiRequest } from "../lib/api";
import { getAuthToken } from "../lib/storage";
import type { AppUser } from "../lib/types";

type GoalVisual = {
  headlineText: string;
  imagePath: string;
  altText: string;
};

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

  const loadVisualOptions = async () => {
    if (!token) {
      return;
    }

    const data = await apiRequest<{ options: GoalVisualOption[] }>("/api/goals/visual-options", { token });
    setVisualOptions(data.options);
    setDraft((current) =>
      current.visualOptionId
        ? current
        : {
            ...current,
            visualOptionId: data.options[0]?.id ?? initialDraft.visualOptionId
          }
    );
  };

  const loadGoals = async () => {
    if (!token) {
      return;
    }

    const data = await apiRequest<{ goals: Goal[] }>("/api/goals", { token });
    setGoals(data.goals);
    setSelectedGoal((current) =>
      current ? data.goals.find((goal) => goal.id === current.id) ?? null : null
    );
  };

  useEffect(() => {
    void loadVisualOptions();
    void loadGoals();
  }, [token]);

  const resetDraft = () => {
    setDraft((current) => ({
      ...initialDraft,
      visualOptionId: visualOptions[0]?.id ?? current.visualOptionId ?? initialDraft.visualOptionId
    }));
  };

  const selectedVisualOption = useMemo(
    () =>
      visualOptions.find((option) => option.id === draft.visualOptionId)
      ?? visualOptions[0]
      ?? null,
    [draft.visualOptionId, visualOptions]
  );

  const createGoal = async () => {
    if (!token || !selectedVisualOption) {
      return;
    }

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
  };

  const updateGoal = async () => {
    if (!token || !selectedGoal || !selectedVisualOption) {
      return;
    }

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
    setSelectedGoal(null);
    await loadGoals();
  };

  const deleteGoal = async (goalId: string) => {
    if (!token) {
      return;
    }

    await apiRequest(`/api/goals/${goalId}`, {
      method: "DELETE",
      token
    });

    if (selectedGoal?.id === goalId) {
      setSelectedGoal(null);
      resetDraft();
    }

    await loadGoals();
  };

  const openEdit = (goal: Goal) => {
    setSelectedGoal(goal);

    const matchedOption = visualOptions.find(
      (option) =>
        option.visualCategory === goal.visualCategory
        && option.visualSubcategory === goal.visualSubcategory
    );

    setDraft({
      title: goal.title,
      targetAmount: String(goal.targetAmount),
      deadline: goal.deadline ?? "",
      note: goal.note ?? "",
      visualTheme: goal.visualTheme,
      visualOptionId: matchedOption?.id ?? visualOptions[0]?.id ?? initialDraft.visualOptionId
    });
  };

  const featuredGoal = goals[0] ?? null;
  const totalCurrent = goals.reduce((sum, goal) => sum + goal.currentAmount, 0);
  const totalTarget = goals.reduce((sum, goal) => sum + goal.targetAmount, 0);
  const overallRate = totalTarget > 0 ? Math.floor((totalCurrent / totalTarget) * 100) : 0;

  return (
    <AppLayout onLogout={onLogout} subtitle="目標を選び、進み方を整え、日々の貯金を意味のある行動に変える画面です。" title="目標" user={user}>
      <section className="shellHero">
        <article className="surface-card feature-goal-card">
          <p className="section-label">Main Goal</p>
          {featuredGoal ? (
            <>
              <div className="goal-visual-frame hero-visual">
                <img alt={featuredGoal.visual.altText} className="goal-visual-image" src={featuredGoal.visual.imagePath} />
              </div>
              <p className="muted-copy">{featuredGoal.visual.headlineText}</p>
              <h2>{featuredGoal.title}</h2>
              <div className="numberDisplay">{featuredGoal.achievementRate}%</div>
              <div className="progress-track large">
                <div className="progress-value" style={{ width: `${Math.min(featuredGoal.achievementRate, 100)}%` }} />
              </div>
              <div className="goal-meta-row">
                <span>残り {featuredGoal.remainingAmount} 円</span>
                <span>{featuredGoal.remainingDays ?? "-"} 日</span>
              </div>
            </>
          ) : (
            <>
              <h2>最初の目標を作る</h2>
              <p className="muted-copy">旅行、ガジェット、生活改善など、続ける理由になる目標を 1 つ置いてください。</p>
            </>
          )}
        </article>

        <article className="surface-card form-card">
          <p className="section-label">{selectedGoal ? "Edit Goal" : "New Goal"}</p>
          <div className="pillRow">
            <span className="softPill">総貯金 {totalCurrent} 円</span>
            <span className="softPill">総目標 {totalTarget} 円</span>
            <span className="softPill">全体 {overallRate}%</span>
          </div>
          <div className="stack compact">
            <label className="field">
              <span>目標名</span>
              <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            </label>
            <label className="field">
              <span>目標金額</span>
              <input type="number" min="1" value={draft.targetAmount} onChange={(event) => setDraft({ ...draft, targetAmount: event.target.value })} />
            </label>
            <label className="field">
              <span>期限</span>
              <input type="date" value={draft.deadline} onChange={(event) => setDraft({ ...draft, deadline: event.target.value })} />
            </label>
            <label className="field">
              <span>カテゴリ</span>
              <select value={draft.visualOptionId} onChange={(event) => setDraft({ ...draft, visualOptionId: event.target.value })}>
                {visualOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                  </option>
                ))}
              </select>
            </label>
            {selectedVisualOption && (
              <article className="goal-preview-card">
                <div className="goal-visual-frame">
                  <img alt={selectedVisualOption.title} className="goal-visual-image" src={selectedVisualOption.imagePath} />
                </div>
                <div className="goal-preview-copy">
                  <strong>{selectedVisualOption.title}</strong>
                  <p>{selectedVisualOption.comment}</p>
                  <span className="goal-pill">{selectedVisualOption.promptLabel}</span>
                </div>
              </article>
            )}
            <label className="field">
              <span>テーマ</span>
              <select value={draft.visualTheme} onChange={(event) => setDraft({ ...draft, visualTheme: event.target.value })}>
                <option value="SOFT">Soft</option>
                <option value="POP">Pop</option>
                <option value="CALM">Calm</option>
              </select>
            </label>
            <label className="field">
              <span>メモ</span>
              <input value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} />
            </label>
            <div className="button-row">
              <button className="button" onClick={() => void (selectedGoal ? updateGoal() : createGoal())} type="button">
                {selectedGoal ? "更新する" : "追加する"}
              </button>
              {selectedGoal && (
                <button
                  className="button button-secondary"
                  onClick={() => {
                    setSelectedGoal(null);
                    resetDraft();
                  }}
                  type="button"
                >
                  キャンセル
                </button>
              )}
            </div>
          </div>
        </article>
      </section>

      <section className="content-section">
        <div className="section-heading-row">
          <div>
            <p className="section-label">Goal List</p>
            <h2 className="section-title">すべての目標</h2>
          </div>
        </div>

        <div className="goal-list">
          {goals.map((goal) => (
            <article className="goal-row-card goal-row-card-visual" key={goal.id}>
              <div className="goal-inline-visual">
                <div className="goal-visual-frame list-visual">
                  <img alt={goal.visual.altText} className="goal-visual-image" src={goal.visual.imagePath} />
                </div>
              </div>
              <div className="goal-row-copy">
                <strong>{goal.title}</strong>
                <p>{goal.visual.headlineText}</p>
                <p>{goal.currentAmount} / {goal.targetAmount} 円</p>
                <p className="muted-copy">残り {goal.remainingAmount} 円{goal.remainingDays !== null ? ` ・ ${goal.remainingDays}日` : ""}</p>
              </div>
              <div className="goal-row-side">
                <span className="goal-pill">{goal.achievementRate}%</span>
                <div className="progress-track">
                  <div className="progress-value" style={{ width: `${Math.min(goal.achievementRate, 100)}%` }} />
                </div>
                <div className="button-row wrap-row">
                  <button className="button button-secondary" onClick={() => openEdit(goal)} type="button">
                    編集
                  </button>
                  <button className="button button-secondary danger-button" onClick={() => void deleteGoal(goal.id)} type="button">
                    削除
                  </button>
                </div>
              </div>
            </article>
          ))}
          {goals.length === 0 && <article className="empty-card">まだ目標がありません。</article>}
        </div>
      </section>

      {selectedGoal && (
        <section className="content-section">
          <article className="surface-card">
            <p className="section-label">Detail Sheet</p>
            <h2 className="section-title">{selectedGoal.title}</h2>
            <div className="shellHero">
              <div className="goal-visual-frame hero-visual">
                <img alt={selectedGoal.visual.altText} className="goal-visual-image" src={selectedGoal.visual.imagePath} />
              </div>
              <div className="goal-list">
                <article className="subpanel">
                  <strong>現在額</strong>
                  <p>{selectedGoal.currentAmount} 円</p>
                </article>
                <article className="subpanel">
                  <strong>目標額</strong>
                  <p>{selectedGoal.targetAmount} 円</p>
                </article>
                <article className="subpanel">
                  <strong>残り</strong>
                  <p>{selectedGoal.remainingAmount} 円</p>
                </article>
                <article className="subpanel">
                  <strong>期限</strong>
                  <p>{selectedGoal.deadline ?? "期限なし"}</p>
                </article>
              </div>
            </div>
          </article>
        </section>
      )}
    </AppLayout>
  );
}
