import { useEffect, useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { apiRequest } from "../lib/api";
import { getAuthToken } from "../lib/storage";
import type { AppUser } from "../lib/types";

type Category = {
  id: string;
  name: string;
  type: string;
};

type SettingsPageProps = {
  user: AppUser;
  onLogout: () => Promise<void>;
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
  const [noticeState, setNoticeState] = useState({
    enabled: true,
    daily: true,
    weekly: false,
    goal: true,
    deficit: false
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      return;
    }

    void apiRequest<{ categories: Category[] }>("/api/categories", { token }).then((data) => setCategories(data.categories));
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
      setMessage("設定を更新しました。");
      setProfile((current) => ({ ...current, currentPassword: "" }));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "設定の保存に失敗しました");
    }
  };

  const incomeCategories = categories.filter((category) => category.type === "INCOME");
  const expenseCategories = categories.filter((category) => category.type === "EXPENSE");

  return (
    <AppLayout onLogout={onLogout} subtitle="プロフィール、期間設定、カテゴリ確認を 1 か所で整える設定画面です。" title="設定" user={user}>
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
            {message && <p className="success-text">{message}</p>}
            {error && <p className="error-text">{error}</p>}
          </div>
        </article>

        <article className="surface-card">
          <p className="section-label">Notifications</p>
          <h2 className="section-title">通知設定</h2>
          <div className="goal-list">
            <label className="checkbox-row"><input checked={noticeState.enabled} onChange={(event) => setNoticeState({ ...noticeState, enabled: event.target.checked })} type="checkbox" /><span>通知を有効にする</span></label>
            <label className="checkbox-row"><input checked={noticeState.daily} onChange={(event) => setNoticeState({ ...noticeState, daily: event.target.checked })} type="checkbox" /><span>日次リマインド</span></label>
            <label className="checkbox-row"><input checked={noticeState.weekly} onChange={(event) => setNoticeState({ ...noticeState, weekly: event.target.checked })} type="checkbox" /><span>週次サマリー</span></label>
            <label className="checkbox-row"><input checked={noticeState.goal} onChange={(event) => setNoticeState({ ...noticeState, goal: event.target.checked })} type="checkbox" /><span>目標通知</span></label>
            <label className="checkbox-row"><input checked={noticeState.deficit} onChange={(event) => setNoticeState({ ...noticeState, deficit: event.target.checked })} type="checkbox" /><span>赤字アラート</span></label>
            <p className="muted-copy">通知の実送信連携はまだ未実装です。Phase 8 では設定画面の構成を先に整えています。</p>
          </div>
        </article>
      </section>

      <section className="content-section">
        <div className="section-heading-row">
          <div>
            <p className="section-label">Categories</p>
            <h2 className="section-title">カテゴリ一覧</h2>
          </div>
        </div>
        <article className="surface-card">
          <div className="goal-list">
            <div>
              <p className="section-label">Expense</p>
              <div className="pillRow">
                {expenseCategories.map((category) => (
                  <span className="softPill" key={category.id}>{category.name}</span>
                ))}
              </div>
            </div>
            <div>
              <p className="section-label">Income</p>
              <div className="pillRow">
                {incomeCategories.map((category) => (
                  <span className="softPill" key={category.id}>{category.name}</span>
                ))}
              </div>
            </div>
            <p className="muted-copy">カテゴリの追加・編集・削除 API はまだないため、Phase 8 では閲覧中心で整えています。</p>
          </div>
        </article>
      </section>
    </AppLayout>
  );
}
