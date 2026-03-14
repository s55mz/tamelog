import { useEffect, useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { Feedback } from "../components/ui";
import { apiRequest } from "../lib/api";
import { getAuthToken } from "../lib/storage";
import type { AppUser } from "../lib/types";

type Category = { id: string; name: string; type: string; isDefault?: boolean };

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
    if (!token) return;
    const [categoriesData, preferenceData] = await Promise.all([
      apiRequest<{ categories: Category[] }>("/api/categories", { token }),
      apiRequest<PreferenceState>("/api/users/me/preferences", { token })
    ]);
    setCategories(categoriesData.categories);
    setNoticeState(preferenceData);
  };

  useEffect(() => { void loadSettings(); }, [token]);

  const saveProfile = async () => {
    if (!token) return;
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
      setError(nextError instanceof Error ? nextError.message : "保存に失敗しました");
    }
  };

  const savePreferences = async () => {
    if (!token) return;
    setMessage("");
    setError("");
    try {
      await apiRequest("/api/users/me/preferences", { method: "PUT", token, body: noticeState });
      setMessage("通知設定を更新しました。");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "保存に失敗しました");
    }
  };

  const saveCategory = async () => {
    if (!token || !categoryDraft.name.trim()) return;
    setMessage("");
    setError("");
    try {
      if (categoryDraft.id) {
        await apiRequest(`/api/categories/${categoryDraft.id}`, {
          method: "PUT",
          token,
          body: { name: categoryDraft.name, type: categoryDraft.type }
        });
      } else {
        await apiRequest("/api/categories", {
          method: "POST",
          token,
          body: { name: categoryDraft.name, type: categoryDraft.type }
        });
      }
      setCategoryDraft({ id: "", name: "", type: "EXPENSE" });
      setMessage("カテゴリを更新しました。");
      await loadSettings();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "保存に失敗しました");
    }
  };

  const deleteCategory = async (categoryId: string) => {
    if (!token) return;
    setMessage("");
    setError("");
    try {
      await apiRequest(`/api/categories/${categoryId}`, { method: "DELETE", token });
      setMessage("カテゴリを削除しました。");
      await loadSettings();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "削除に失敗しました");
    }
  };

  const resetDefaultCategories = async () => {
    if (!token) return;
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
      setError(nextError instanceof Error ? nextError.message : "復元に失敗しました");
    }
  };

  const incomeCategories = categories.filter((c) => c.type === "INCOME");
  const expenseCategories = categories.filter((c) => c.type === "EXPENSE");

  return (
    <AppLayout onLogout={onLogout} title="設定" user={user}>
      {/* ── Profile ────────────────────────────────────── */}
      <div>
        <p className="eyebrow" style={{ marginBottom: "var(--s3)" }}>プロフィール</p>
        <div className="card form-stack">
          <div className="form-grid">
            <label className="field">
              <span className="field__label">名前</span>
              <input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} />
            </label>
            <label className="field">
              <span className="field__label">メールアドレス</span>
              <input value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} />
            </label>
            <label className="field">
              <span className="field__label">給料日</span>
              <select value={profile.paydayOfMonth} onChange={(event) => setProfile({ ...profile, paydayOfMonth: event.target.value })}>
                {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                  <option key={day} value={day}>{day}日</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">現在パスワード</span>
              <input type="password" value={profile.currentPassword} onChange={(event) => setProfile({ ...profile, currentPassword: event.target.value })} placeholder="変更する場合のみ" />
            </label>
          </div>
          <button className="btn btn--fill" onClick={() => void saveProfile()} type="button">
            保存する
          </button>
        </div>
      </div>

      {/* ── Notifications ──────────────────────────────── */}
      <div>
        <p className="eyebrow" style={{ marginBottom: "var(--s3)" }}>通知設定</p>
        <div className="card form-stack">
          <div className="toggle-list">
            {(
              [
                ["notificationsEnabled", "通知を有効にする"],
                ["dailyReminder", "日次リマインド"],
                ["weeklySummary", "週次サマリー"],
                ["goalNotification", "目標通知"],
                ["deficitAlert", "赤字アラート"]
              ] as [keyof PreferenceState, string][]
            ).map(([key, label]) => (
              <label className="toggle-row" key={key}>
                <input
                  checked={noticeState[key]}
                  onChange={(event) => setNoticeState({ ...noticeState, [key]: event.target.checked })}
                  type="checkbox"
                />
                {label}
              </label>
            ))}
          </div>
          <button className="btn btn--fill" onClick={() => void savePreferences()} type="button">
            通知設定を保存
          </button>
        </div>
      </div>

      {/* ── Categories ─────────────────────────────────── */}
      <div>
        <div className="row row--spread" style={{ marginBottom: "var(--s3)" }}>
          <p className="eyebrow">カテゴリ管理</p>
          <button className="btn btn--out btn--sm" onClick={() => void resetDefaultCategories()} type="button">
            デフォルトに戻す
          </button>
        </div>

        <div className="two-up" style={{ marginBottom: "var(--s4)" }}>
          <div className="card">
            <p className="eyebrow" style={{ marginBottom: "var(--s3)" }}>支出カテゴリ</p>
            {expenseCategories.map((category) => (
              <div className="mini-row" key={category.id}>
                <div className="mini-row__body">
                  <strong>{category.name}</strong>
                  <p>{category.isDefault ? "デフォルト" : "カスタム"}</p>
                </div>
                <div className="btn-row">
                  <button className="btn btn--out btn--sm" onClick={() => setCategoryDraft({ id: category.id, name: category.name, type: category.type })} type="button">
                    編集
                  </button>
                  <button className="btn btn--del btn--sm" onClick={() => void deleteCategory(category.id)} type="button">
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <p className="eyebrow" style={{ marginBottom: "var(--s3)" }}>収入カテゴリ</p>
            {incomeCategories.map((category) => (
              <div className="mini-row" key={category.id}>
                <div className="mini-row__body">
                  <strong>{category.name}</strong>
                  <p>{category.isDefault ? "デフォルト" : "カスタム"}</p>
                </div>
                <div className="btn-row">
                  <button className="btn btn--out btn--sm" onClick={() => setCategoryDraft({ id: category.id, name: category.name, type: category.type })} type="button">
                    編集
                  </button>
                  <button className="btn btn--del btn--sm" onClick={() => void deleteCategory(category.id)} type="button">
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Category form */}
        <div className="card form-stack">
          <p className="eyebrow">{categoryDraft.id ? "カテゴリを編集" : "カテゴリを追加"}</p>
          <div className="form-grid">
            <label className="field">
              <span className="field__label">カテゴリ名</span>
              <input value={categoryDraft.name} onChange={(event) => setCategoryDraft({ ...categoryDraft, name: event.target.value })} />
            </label>
            <label className="field">
              <span className="field__label">種別</span>
              <select value={categoryDraft.type} onChange={(event) => setCategoryDraft({ ...categoryDraft, type: event.target.value })}>
                <option value="EXPENSE">支出</option>
                <option value="INCOME">収入</option>
              </select>
            </label>
          </div>
          <div className="btn-row">
            <button className="btn btn--fill" onClick={() => void saveCategory()} type="button">
              保存する
            </button>
            {categoryDraft.id ? (
              <button className="btn btn--out" onClick={() => setCategoryDraft({ id: "", name: "", type: "EXPENSE" })} type="button">
                キャンセル
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {message ? <Feedback kind="ok">{message}</Feedback> : null}
      {error ? <Feedback kind="err">{error}</Feedback> : null}
    </AppLayout>
  );
}
