import { useEffect, useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { apiRequest } from "../lib/api";
import { getAuthToken } from "../lib/storage";
import type { AppUser } from "../lib/types";

type Goal = {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  achievementRate: number;
  remainingAmount: number;
  remainingDays: number | null;
  deadline: string | null;
  visual: {
    headlineText: string;
  };
};

type GoalsPageProps = {
  user: AppUser;
  onLogout: () => Promise<void>;
};

export function GoalsPage({ user, onLogout }: GoalsPageProps) {
  const token = getAuthToken();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [draft, setDraft] = useState({
    title: "",
    targetAmount: "",
    deadline: "",
    note: "",
    visualTheme: "SOFT"
  });

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
    void loadGoals();
  }, [token]);

  const resetDraft = () => {
    setDraft({
      title: "",
      targetAmount: "",
      deadline: "",
      note: "",
      visualTheme: "SOFT"
    });
  };

  const createGoal = async () => {
    if (!token) {
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
        visualTheme: draft.visualTheme
      }
    });

    resetDraft();
    await loadGoals();
  };

  const updateGoal = async () => {
    if (!token || !selectedGoal) {
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
        visualTheme: draft.visualTheme
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
    }
    await loadGoals();
  };

  const openEdit = (goal: Goal) => {
    setSelectedGoal(goal);
    setDraft({
      title: goal.title,
      targetAmount: String(goal.targetAmount),
      deadline: goal.deadline ?? "",
      note: "",
      visualTheme: "SOFT"
    });
  };

  const featuredGoal = goals[0] ?? null;

  return (
    <AppLayout onLogout={onLogout} subtitle="メインの貯金目標を作って、進捗を視覚的に追える画面です。" title="目標" user={user}>
      <section className="dashboard-grid">
        <article className="surface-card feature-goal-card">
          <p className="section-label">Main Goal</p>
          {featuredGoal ? (
            <>
              <h2>{featuredGoal.title}</h2>
              <p className="muted-copy">{featuredGoal.visual.headlineText}</p>
              <div className="stat-hero">{featuredGoal.achievementRate}%</div>
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
            <article className="goal-row-card" key={goal.id}>
              <div className="goal-row-copy">
                <strong>{goal.title}</strong>
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
    </AppLayout>
  );
}
