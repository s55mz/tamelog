import { useEffect, useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { apiRequest } from "../lib/api";
import { getAuthToken } from "../lib/storage";
import type { AppUser } from "../lib/types";

type Category = {
  id: string;
  name: string;
  type: string;
  isDefault?: boolean;
};

type PreferenceState = {
  notificationsEnabled: boolean;
  dailyReminder: boolean;
  weeklySummary: boolean;
  goalNotification: boolean;
  deficitAlert: boolean;
};

type SettingsPageProps = {
  user: AppUser;
  onLogout: () => Promise<void>;
};

const initialPreferenceState: PreferenceState = {
  notificationsEnabled: true,
  dailyReminder: true,
  weeklySummary: false,
  goalNotification: true,
  deficitAlert: false
};

export function SettingsPage({ user, onLogout }: SettingsPageProps) {
  const token = getAuthToken();
  const [profile, setProfile] = useState({
    name: user.name,
    email: user.email,
    paydayOfMonth: String(user.paydayOfMonth),
    currentPassword: ""
  });
  const [categories, setCategories] = useState<Category[]>([]);
  const [noticeState, setNoticeState] = useState<PreferenceState>(initialPreferenceState);
  const [categoryDraft, setCategoryDraft] = useState({ id: "", name: "", type: "EXPENSE" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadSettings = async () => {
    if (!token) {
      return;
    }

    const [categoriesData, preferenceData] = await Promise.all([
      apiRequest<{ categories: Category[] }>("/api/categories", { token }),
      apiRequest<PreferenceState>("/api/users/me/preferences", { token })
    ]);

    setCategories(categoriesData.categories);
    setNoticeState(preferenceData);
  };

  useEffect(() => {
    void loadSettings();
  }, [token]);

  const saveProfile = async () => {
    if (!token) {
      return;
    }

    setMessage("");
    setError("");

    try {
      await apiRequest<AppUser>("/api/users/me", {
        method: "PUT",
        token,
        body: {
          name: profile.name,
          email: profile.email,
          paydayOfMonth: Number(profile.paydayOfMonth),
          currentPassword: profile.currentPassword || undefined
        }
      });
      setMessage("プロフィールを更新しました。");
      setProfile((current) => ({ ...current, currentPassword: "" }));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "設定の保存に失敗しました");
    }
  };

  const savePreferences = async () => {
    if (!token) {
      return;
    }

    setMessage("");
    setError("");

    try {
      await apiRequest("/api/users/me/preferences", {
        method: "PUT",
        token,
        body: noticeState
      });
      setMessage("通知設定を更新しました。");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "通知設定の保存に失敗しました");
    }
  };

  const saveCategory = async () => {
    if (!token || !categoryDraft.name.trim()) {
      return;
    }

    setMessage("");
    setError("");

    try {
      if (categoryDraft.id) {
        await apiRequest(`/api/categories/${categoryDraft.id}`, {
          method: "PUT",
          token,
          body: {
            name: categoryDraft.name,
            type: categoryDraft.type
          }
        });
      } else {
        await apiRequest("/api/categories", {
          method: "POST",
          token,
          body: {
            name: categoryDraft.name,
            type: categoryDraft.type
          }
        });
      }

      setCategoryDraft({ id: "", name: "", type: "EXPENSE" });
      setMessage("カテゴリを更新しました。");
      await loadSettings();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "カテゴリの保存に失敗しました");
    }
  };

  const deleteCategory = async (categoryId: string) => {
    if (!token) {
      return;
    }

    setMessage("");
    setError("");

    try {
      await apiRequest(`/api/categories/${categoryId}`, {
        method: "DELETE",
        token
      });
      setMessage("カテゴリを削除しました。");
      await loadSettings();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "カテゴリの削除に失敗しました");
    }
  };

  const resetDefaultCategories = async () => {
    if (!token) {
      return;
    }

    setMessage("");
    setError("");

    try {
      const data = await apiRequest<{ categories: Category[] }>("/api/categories/reset-defaults", {
        method: "POST",
        token
      });
      setCategories(data.categories);
      setMessage("デフォルトカテゴリを復元しました。");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "カテゴリの復元に失敗しました");
    }
  };

  const incomeCategories = categories.filter((category) => category.type === "INCOME");
  const expenseCategories = categories.filter((category) => category.type === "EXPENSE");

  return (
    <AppLayout onLogout={onLogout} subtitle="プロフィール、給料日、カテゴリ、通知設定をまとめて整える設定画面です。" title="設定" user={user}>
      <section className="dashboard-grid">
        <article className="surface-card">
          <p className="section-label">Profile</p>
          <h2 className="section-title">プロフィール</h2>
          <div className="stack compact">
            <label className="field">
              <span>名前</span>
              <input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} />
            </label>
            <label className="field">
              <span>メールアドレス</span>
              <input value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} />
            </label>
            <label className="field">
              <span>給料日</span>
              <select value={profile.paydayOfMonth} onChange={(event) => setProfile({ ...profile, paydayOfMonth: event.target.value })}>
                {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                  <option key={day} value={day}>
                    {day}日
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>メール変更時の現在パスワード</span>
              <input type="password" value={profile.currentPassword} onChange={(event) => setProfile({ ...profile, currentPassword: event.target.value })} />
            </label>
            <button className="button" onClick={() => void saveProfile()} type="button">
              保存する
            </button>
          </div>
        </article>

        <article className="surface-card">
          <p className="section-label">Notifications</p>
          <h2 className="section-title">通知設定</h2>
          <div className="goal-list">
            <label className="checkbox-row"><input checked={noticeState.notificationsEnabled} onChange={(event) => setNoticeState({ ...noticeState, notificationsEnabled: event.target.checked })} type="checkbox" /><span>通知を有効にする</span></label>
            <label className="checkbox-row"><input checked={noticeState.dailyReminder} onChange={(event) => setNoticeState({ ...noticeState, dailyReminder: event.target.checked })} type="checkbox" /><span>日次リマインド</span></label>
            <label className="checkbox-row"><input checked={noticeState.weeklySummary} onChange={(event) => setNoticeState({ ...noticeState, weeklySummary: event.target.checked })} type="checkbox" /><span>週次サマリー</span></label>
            <label className="checkbox-row"><input checked={noticeState.goalNotification} onChange={(event) => setNoticeState({ ...noticeState, goalNotification: event.target.checked })} type="checkbox" /><span>目標通知</span></label>
            <label className="checkbox-row"><input checked={noticeState.deficitAlert} onChange={(event) => setNoticeState({ ...noticeState, deficitAlert: event.target.checked })} type="checkbox" /><span>赤字アラート</span></label>
            <button className="button" onClick={() => void savePreferences()} type="button">
              通知設定を保存
            </button>
          </div>
        </article>
      </section>

      <section className="content-section">
        <div className="section-heading-row">
          <div>
            <p className="section-label">Categories</p>
            <h2 className="section-title">カテゴリ管理</h2>
          </div>
          <button className="ghostButton" onClick={() => void resetDefaultCategories()} type="button">
            デフォルトに戻す
          </button>
        </div>
        <article className="surface-card">
          <div className="shellHero">
            <div className="goal-list">
              <div>
                <p className="section-label">Expense</p>
                <div className="goal-list">
                  {expenseCategories.map((category) => (
                    <article className="goal-row-card" key={category.id}>
                      <div className="goal-row-copy">
                        <strong>{category.name}</strong>
                        <p className="muted-copy">{category.isDefault ? "デフォルトカテゴリ" : "カスタムカテゴリ"}</p>
                      </div>
                      <div className="button-row wrap-row">
                        <button className="ghostButton" onClick={() => setCategoryDraft({ id: category.id, name: category.name, type: category.type })} type="button">編集</button>
                        <button className="ghostButton danger-button" onClick={() => void deleteCategory(category.id)} type="button">削除</button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
              <div>
                <p className="section-label">Income</p>
                <div className="goal-list">
                  {incomeCategories.map((category) => (
                    <article className="goal-row-card" key={category.id}>
                      <div className="goal-row-copy">
                        <strong>{category.name}</strong>
                        <p className="muted-copy">{category.isDefault ? "デフォルトカテゴリ" : "カスタムカテゴリ"}</p>
                      </div>
                      <div className="button-row wrap-row">
                        <button className="ghostButton" onClick={() => setCategoryDraft({ id: category.id, name: category.name, type: category.type })} type="button">編集</button>
                        <button className="ghostButton danger-button" onClick={() => void deleteCategory(category.id)} type="button">削除</button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>

            <article className="subpanel">
              <p className="section-label">{categoryDraft.id ? "Edit Category" : "New Category"}</p>
              <div className="stack compact">
                <label className="field">
                  <span>カテゴリ名</span>
                  <input value={categoryDraft.name} onChange={(event) => setCategoryDraft({ ...categoryDraft, name: event.target.value })} />
                </label>
                <label className="field">
                  <span>種別</span>
                  <select value={categoryDraft.type} onChange={(event) => setCategoryDraft({ ...categoryDraft, type: event.target.value })}>
                    <option value="EXPENSE">支出</option>
                    <option value="INCOME">収入</option>
                  </select>
                </label>
                <div className="button-row">
                  <button className="button" onClick={() => void saveCategory()} type="button">{categoryDraft.id ? "更新する" : "追加する"}</button>
                  {categoryDraft.id && (
                    <button className="ghostButton" onClick={() => setCategoryDraft({ id: "", name: "", type: "EXPENSE" })} type="button">キャンセル</button>
                  )}
                </div>
              </div>
            </article>
          </div>
          {message && <p className="success-text">{message}</p>}
          {error && <p className="error-text">{error}</p>}
        </article>
      </section>
    </AppLayout>
  );
}
