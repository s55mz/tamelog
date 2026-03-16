import { useEffect, useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { apiRequest } from "../lib/api";
import { isPushSubscribed, subscribePush, unsubscribePush } from "../lib/push";
import { getAuthToken } from "../lib/storage";
import { useToast } from "../lib/toast";
import type { AppUser } from "../lib/types";

type Category = { id: string; name: string; type: string; isDefault?: boolean };

type VpnDevice = { id: string; vpnIp: string; deviceName: string; platform: string; status: string; createdAt: string };
type VpnSetupData = { id: string; vpnIp: string; mobileconfigUrl: string; platform: string };

type PreferenceState = {
  notificationsEnabled: boolean;
  dailyReminder: boolean;
  weeklySummary: boolean;
  goalNotification: boolean;
  deficitAlert: boolean;
};

type BlockCategoryCode = "EC" | "PAYMENT";

type BlockSchedule = {
  categoryCode: BlockCategoryCode;
  categoryName: string;
  enabled: boolean;
  days: number[];
  startTime: string;
  endTime: string;
};

type BlockSettingsState = {
  warningNotificationEnabled: boolean;
  webPushEnabled: boolean;
  vpnConnectionEnabled: boolean;
  caCertificateInstalled: boolean;
  schedules: BlockSchedule[];
};

type SettingsPageProps = {
  user: AppUser;
  onLogout: () => Promise<void>;
};

type SettingsTab = "profile" | "notifications" | "vpn" | "categories";

const initialPreferenceState: PreferenceState = {
  notificationsEnabled: true,
  dailyReminder: true,
  weeklySummary: false,
  goalNotification: true,
  deficitAlert: false
};

const initialBlockSettings: BlockSettingsState = {
  warningNotificationEnabled: true,
  webPushEnabled: false,
  vpnConnectionEnabled: false,
  caCertificateInstalled: false,
  schedules: [
    { categoryCode: "EC", categoryName: "ECサイト", enabled: false, days: [0,1,2,3,4,5,6], startTime: "22:00", endTime: "08:00" },
    { categoryCode: "PAYMENT", categoryName: "決済アプリ", enabled: false, days: [0,1,2,3,4,5,6], startTime: "00:00", endTime: "23:59" }
  ]
};

const dayOptions = [
  { value: 1, label: "月" }, { value: 2, label: "火" }, { value: 3, label: "水" },
  { value: 4, label: "木" }, { value: 5, label: "金" }, { value: 6, label: "土" }, { value: 0, label: "日" }
];

const TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: "profile",       label: "基本",     icon: "person" },
  { id: "notifications", label: "通知",     icon: "notifications" },
  { id: "vpn",           label: "VPN",      icon: "vpn_key" },
  { id: "categories",    label: "カテゴリ", icon: "label" }
];

export function SettingsPage({ user, onLogout }: SettingsPageProps) {
  const token = getAuthToken();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

  const [profile, setProfile] = useState({
    name: user.name,
    email: user.email,
    paydayOfMonth: String(user.paydayOfMonth),
    currentPassword: ""
  });
  const [categories, setCategories] = useState<Category[]>([]);
  const [noticeState, setNoticeState] = useState<PreferenceState>(initialPreferenceState);
  const [categoryDraft, setCategoryDraft] = useState({ id: "", name: "", type: "EXPENSE" });
  const [blockSettings, setBlockSettings] = useState<BlockSettingsState>(initialBlockSettings);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [vpnDevices, setVpnDevices] = useState<VpnDevice[]>([]);
  const [vpnLoading, setVpnLoading] = useState(false);
  const [vpnSetupData, setVpnSetupData] = useState<VpnSetupData | null>(null);
  const [showVpnSetup, setShowVpnSetup] = useState(false);

  function detectPlatform(): string {
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) return "ios";
    if (/android/.test(ua)) return "android";
    if (/macintosh|mac os x/.test(ua) && !/iphone|ipad/.test(ua)) return "mac";
    if (/windows/.test(ua)) return "windows";
    return "other";
  }

  const loadSettings = async () => {
    if (!token) return;
    const [categoriesData, preferenceData, blockSettingsData] = await Promise.all([
      apiRequest<{ categories: Category[] }>("/api/categories", { token }),
      apiRequest<PreferenceState>("/api/users/me/preferences", { token }),
      apiRequest<BlockSettingsState>("/api/users/me/block-settings", { token })
    ]);
    setCategories(categoriesData.categories);
    setNoticeState(preferenceData);
    setBlockSettings(blockSettingsData);
  };

  const loadVpnDevices = async () => {
    if (!token) return;
    try {
      const data = await apiRequest<{ devices: VpnDevice[] }>("/api/vpn/devices", { token });
      setVpnDevices(data.devices);
    } catch { /* ignore */ }
  };

  const addVpnDevice = async () => {
    if (!token) return;
    setVpnLoading(true);
    try {
      const platform = detectPlatform();
      const data = await apiRequest<VpnSetupData>("/api/vpn/devices", {
        method: "POST",
        token,
        body: { platform, deviceName: `${platform} デバイス` }
      });
      setVpnSetupData(data);
      setShowVpnSetup(true);
      await loadVpnDevices();
    } catch (err) {
      toast(err instanceof Error ? err.message : "デバイスの追加に失敗しました", "err");
    } finally {
      setVpnLoading(false);
    }
  };

  const deleteVpnDevice = async (id: string) => {
    if (!token) return;
    try {
      await apiRequest(`/api/vpn/devices/${id}`, { method: "DELETE", token });
      toast("デバイスを削除しました");
      await loadVpnDevices();
    } catch (err) {
      toast(err instanceof Error ? err.message : "削除に失敗しました", "err");
    }
  };

  useEffect(() => { void loadSettings(); void loadVpnDevices(); }, [token]);

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window;
    setPushSupported(supported);
    if (supported) void isPushSubscribed().then(setPushSubscribed);
  }, []);

  const handlePushToggle = async (enabled: boolean) => {
    if (!token) return;
    setPushLoading(true);
    try {
      if (enabled) {
        const success = await subscribePush(token);
        if (!success) { toast("通知の許可が得られませんでした", "err"); return; }
        setPushSubscribed(true);
        toast("プッシュ通知を有効にしました");
      } else {
        await unsubscribePush(token);
        setPushSubscribed(false);
        toast("プッシュ通知を無効にしました");
      }
    } catch {
      toast("プッシュ通知の設定に失敗しました", "err");
    } finally {
      setPushLoading(false);
    }
  };

  const saveProfile = async () => {
    if (!token) return;
    try {
      await apiRequest("/api/users/me", {
        method: "PUT",
        token,
        body: {
          name: profile.name,
          email: profile.email,
          paydayOfMonth: Number(profile.paydayOfMonth),
          currentPassword: profile.currentPassword || undefined
        }
      });
      toast("プロフィールを更新しました");
      setProfile((c) => ({ ...c, currentPassword: "" }));
    } catch (err) {
      toast(err instanceof Error ? err.message : "保存に失敗しました", "err");
    }
  };

  const savePreferences = async () => {
    if (!token) return;
    try {
      await apiRequest("/api/users/me/preferences", { method: "PUT", token, body: noticeState });
      toast("通知設定を更新しました");
    } catch (err) {
      toast(err instanceof Error ? err.message : "保存に失敗しました", "err");
    }
  };

  const saveBlockSettings = async () => {
    if (!token) return;
    try {
      const saved = await apiRequest<BlockSettingsState>("/api/users/me/block-settings", {
        method: "PUT", token, body: blockSettings
      });
      setBlockSettings(saved);
      toast("ブロック設定を更新しました");
    } catch (err) {
      toast(err instanceof Error ? err.message : "保存に失敗しました", "err");
    }
  };

  const updateSchedule = (categoryCode: BlockCategoryCode, updater: (c: BlockSchedule) => BlockSchedule) => {
    setBlockSettings((c) => ({
      ...c,
      schedules: c.schedules.map((s) => s.categoryCode === categoryCode ? updater(s) : s)
    }));
  };

  const toggleScheduleDay = (categoryCode: BlockCategoryCode, day: number) => {
    updateSchedule(categoryCode, (s) => ({
      ...s,
      days: s.days.includes(day) ? s.days.filter((d) => d !== day) : [...s.days, day].sort((a, b) => a - b)
    }));
  };

  const saveCategory = async () => {
    if (!token || !categoryDraft.name.trim()) return;
    try {
      if (categoryDraft.id) {
        await apiRequest(`/api/categories/${categoryDraft.id}`, {
          method: "PUT", token, body: { name: categoryDraft.name, type: categoryDraft.type }
        });
      } else {
        await apiRequest("/api/categories", {
          method: "POST", token, body: { name: categoryDraft.name, type: categoryDraft.type }
        });
      }
      setCategoryDraft({ id: "", name: "", type: "EXPENSE" });
      toast("カテゴリを更新しました");
      await loadSettings();
    } catch (err) {
      toast(err instanceof Error ? err.message : "保存に失敗しました", "err");
    }
  };

  const deleteCategory = async (categoryId: string) => {
    if (!token) return;
    try {
      await apiRequest(`/api/categories/${categoryId}`, { method: "DELETE", token });
      toast("カテゴリを削除しました");
      await loadSettings();
    } catch (err) {
      toast(err instanceof Error ? err.message : "削除に失敗しました", "err");
    }
  };

  const resetDefaultCategories = async () => {
    if (!token) return;
    try {
      const data = await apiRequest<{ categories: Category[] }>("/api/categories/reset-defaults", { method: "POST", token });
      setCategories(data.categories);
      toast("デフォルトカテゴリを復元しました");
    } catch (err) {
      toast(err instanceof Error ? err.message : "復元に失敗しました", "err");
    }
  };

  const incomeCategories = categories.filter((c) => c.type === "INCOME");
  const expenseCategories = categories.filter((c) => c.type === "EXPENSE");

  return (
    <AppLayout
      onLogout={onLogout}
      subtitle="プロフィール・通知・VPN・カテゴリをまとめて管理します。"
      title="設定"
      user={user}
    >
      {/* ── Tab bar ──────────────────────────────────────── */}
      <div className="seg">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`seg__btn${activeTab === tab.id ? " on" : ""}`}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══════════════ TAB: プロフィール ══════════════ */}
      {activeTab === "profile" ? (
        <div className="form-stack">
          <div className="card form-stack">
            <p className="eyebrow">プロフィール</p>
            <div className="form-grid">
              <label className="field">
                <span className="field__label">名前</span>
                <input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
              </label>
              <label className="field">
                <span className="field__label">メールアドレス</span>
                <input value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
              </label>
              <label className="field">
                <span className="field__label">給料日</span>
                <select value={profile.paydayOfMonth} onChange={(e) => setProfile({ ...profile, paydayOfMonth: e.target.value })}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <option key={day} value={day}>{day}日</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">現在パスワード</span>
                <input
                  type="password"
                  value={profile.currentPassword}
                  onChange={(e) => setProfile({ ...profile, currentPassword: e.target.value })}
                  placeholder="変更する場合のみ"
                />
              </label>
            </div>
            <button className="btn btn--fill" onClick={() => void saveProfile()} type="button">
              保存する
            </button>
          </div>
        </div>
      ) : null}

      {/* ══════════════ TAB: 通知 ══════════════ */}
      {activeTab === "notifications" ? (
        <div className="form-stack">
          {/* アプリ内通知 */}
          <div className="card form-stack">
            <p className="eyebrow">アプリ内通知</p>
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
                    onChange={(e) => setNoticeState({ ...noticeState, [key]: e.target.checked })}
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

          {/* プッシュ通知 */}
          {pushSupported ? (
            <div className="card form-stack">
              <p className="eyebrow">プッシュ通知</p>
              <div className="toggle-list">
                <label className="toggle-row">
                  <input
                    checked={pushSubscribed}
                    disabled={pushLoading}
                    onChange={(e) => void handlePushToggle(e.target.checked)}
                    type="checkbox"
                  />
                  このデバイスでプッシュ通知を受け取る
                </label>
              </div>
              <p style={{ fontSize: "12px", color: "var(--text-3)" }}>
                ブラウザの通知許可が必要です。{pushSubscribed ? "現在 ON" : "現在 OFF"}
              </p>
            </div>
          ) : (
            <div className="card">
              <p style={{ fontSize: "13px", color: "var(--text-3)" }}>
                このブラウザはプッシュ通知に対応していません。
              </p>
            </div>
          )}
        </div>
      ) : null}

      {/* ══════════════ TAB: VPN ══════════════ */}
      {activeTab === "vpn" ? (
        <div className="form-stack">
          {/* VPN プロファイル */}
          <div className="card form-stack">
            <p className="eyebrow">VPN プロファイル</p>
            <p style={{ fontSize: "13px", color: "var(--text-2)", lineHeight: 1.6 }}>
              プロファイルをインストールするだけで VPN と CA 証明書が一括設定されます。追加アプリは不要です。
            </p>

            {vpnDevices.length > 0 ? (
              <div className="stack-sm">
                {vpnDevices.map((device) => (
                  <div className="mini-row" key={device.id}>
                    <div className="mini-row__body">
                      <strong>{device.deviceName}</strong>
                      <p className="text-meta">
                        {device.vpnIp} · {device.platform} ·{" "}
                        <span style={{ color: device.status === "ACTIVE" ? "var(--brand)" : "var(--text-3)" }}>
                          {device.status}
                        </span>
                      </p>
                    </div>
                    <button
                      className="btn btn--del btn--sm"
                      onClick={() => void deleteVpnDevice(device.id)}
                      type="button"
                    >
                      削除
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: "13px", color: "var(--text-3)" }}>登録済みのデバイスはありません。</p>
            )}

            <button
              className="btn btn--fill"
              disabled={vpnLoading}
              onClick={() => void addVpnDevice()}
              type="button"
            >
              <span className="material-symbols-outlined">add</span>
              {vpnLoading ? "生成中..." : "このデバイスにプロファイルを作成"}
            </button>

            {showVpnSetup && vpnSetupData ? (
              <div className="card form-stack" style={{ background: "var(--brand-soft)", border: "1px solid var(--brand)" }}>
                <div className="row row--spread">
                  <p className="eyebrow">プロファイルをインストール</p>
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => setShowVpnSetup(false)}
                    type="button"
                  >
                    閉じる
                  </button>
                </div>

                <a
                  className="btn btn--fill"
                  href={vpnSetupData.mobileconfigUrl}
                  rel="noreferrer"
                >
                  <span className="material-symbols-outlined">download</span>
                  プロファイルをダウンロード
                </a>
                <p style={{ fontSize: "12px", color: "var(--text-3)" }}>
                  ※ Safari でこのページを開いてタップしてください（Chrome は非対応）
                </p>

                {vpnSetupData.platform === "ios" ? (
                  <ol style={{ paddingLeft: "1.5em", fontSize: "13px", lineHeight: 1.7, color: "var(--text-2)", display: "flex", flexDirection: "column", gap: "4px" }}>
                    <li>上のボタンをタップしてプロファイルをダウンロード</li>
                    <li>「設定」→ 上部「プロファイルがダウンロードされました」→「インストール」</li>
                    <li>「設定」→「VPN」から接続 / 切断できます</li>
                  </ol>
                ) : vpnSetupData.platform === "mac" ? (
                  <ol style={{ paddingLeft: "1.5em", fontSize: "13px", lineHeight: 1.7, color: "var(--text-2)", display: "flex", flexDirection: "column", gap: "4px" }}>
                    <li>上のボタンをクリックして .mobileconfig をダウンロード</li>
                    <li>ダブルクリック → システム設定 →「プロファイル」→「インストール」</li>
                    <li>「システム設定」→「VPN」から接続できます</li>
                  </ol>
                ) : (
                  <p style={{ fontSize: "13px", color: "var(--text-2)" }}>
                    iOS または Mac でこのリンクを開いてインストールしてください。
                  </p>
                )}
              </div>
            ) : null}
          </div>

          {/* ブロック設定 */}
          <div className="card form-stack">
            <p className="eyebrow">ブロック設定</p>
            <p style={{ fontSize: "13px", color: "var(--text-2)", lineHeight: 1.6 }}>
              カテゴリ単位で止めたい時間帯を設定します。VPN 接続時のみ有効です。
            </p>

            <div className="stack-sm">
              {blockSettings.schedules.map((schedule) => (
                <div className="card form-stack" key={schedule.categoryCode} style={{ background: "var(--bg-2)" }}>
                  <div className="row row--spread">
                    <div>
                      <p style={{ fontWeight: 600, fontSize: "14px" }}>{schedule.categoryName}</p>
                      <p style={{ fontSize: "12px", color: "var(--text-3)" }}>
                        {schedule.categoryCode === "EC" ? "夜間・衝動買い時間帯のみ停止" : "決済アプリのアクセス制限"}
                      </p>
                    </div>
                    <label className="toggle-row">
                      <input
                        checked={schedule.enabled}
                        onChange={(e) => updateSchedule(schedule.categoryCode, (s) => ({ ...s, enabled: e.target.checked }))}
                        type="checkbox"
                      />
                      有効
                    </label>
                  </div>

                  <div className="form-grid">
                    <label className="field">
                      <span className="field__label">開始</span>
                      <input
                        type="time"
                        value={schedule.startTime}
                        onChange={(e) => updateSchedule(schedule.categoryCode, (s) => ({ ...s, startTime: e.target.value }))}
                      />
                    </label>
                    <label className="field">
                      <span className="field__label">終了</span>
                      <input
                        type="time"
                        value={schedule.endTime}
                        onChange={(e) => updateSchedule(schedule.categoryCode, (s) => ({ ...s, endTime: e.target.value }))}
                      />
                    </label>
                  </div>

                  <div>
                    <p className="field__label" style={{ marginBottom: "var(--s2)" }}>適用曜日</p>
                    <div className="chip-group">
                      {dayOptions.map((day) => (
                        <button
                          key={`${schedule.categoryCode}-${day.value}`}
                          className={`chip ${schedule.days.includes(day.value) ? "on" : ""}`}
                          onClick={() => toggleScheduleDay(schedule.categoryCode, day.value)}
                          type="button"
                        >
                          {day.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="toggle-list">
              {(
                [
                  ["warningNotificationEnabled", "ブロック時に警告を表示"],
                  ["vpnConnectionEnabled", "VPN 接続済み（手動確認）"],
                  ["caCertificateInstalled", "CA 証明書インストール済み"]
                ] as [keyof Omit<BlockSettingsState, "schedules">, string][]
              ).map(([key, label]) => (
                <label className="toggle-row" key={key}>
                  <input
                    checked={blockSettings[key]}
                    onChange={(e) => setBlockSettings((c) => ({ ...c, [key]: e.target.checked }))}
                    type="checkbox"
                  />
                  {label}
                </label>
              ))}
            </div>

            <button className="btn btn--fill" onClick={() => void saveBlockSettings()} type="button">
              ブロック設定を保存
            </button>
          </div>
        </div>
      ) : null}

      {/* ══════════════ TAB: カテゴリ ══════════════ */}
      {activeTab === "categories" ? (
        <div className="form-stack">
          <div className="row row--spread">
            <p className="eyebrow">カテゴリ管理</p>
            <button className="btn btn--out btn--sm" onClick={() => void resetDefaultCategories()} type="button">
              デフォルトに戻す
            </button>
          </div>

          <div className="two-up">
            <div className="card form-stack">
              <p className="eyebrow">支出カテゴリ</p>
              <div className="stack-sm">
                {expenseCategories.map((category) => (
                  <div className="mini-row" key={category.id}>
                    <div className="mini-row__body">
                      <strong style={{ fontSize: "13px" }}>{category.name}</strong>
                      <p style={{ fontSize: "11px", color: "var(--text-3)" }}>
                        {category.isDefault ? "デフォルト" : "カスタム"}
                      </p>
                    </div>
                    <div className="btn-row">
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => setCategoryDraft({ id: category.id, name: category.name, type: category.type })}
                        type="button"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>edit</span>
                      </button>
                      <button
                        className="btn btn--del btn--sm"
                        onClick={() => void deleteCategory(category.id)}
                        type="button"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card form-stack">
              <p className="eyebrow">収入カテゴリ</p>
              <div className="stack-sm">
                {incomeCategories.map((category) => (
                  <div className="mini-row" key={category.id}>
                    <div className="mini-row__body">
                      <strong style={{ fontSize: "13px" }}>{category.name}</strong>
                      <p style={{ fontSize: "11px", color: "var(--text-3)" }}>
                        {category.isDefault ? "デフォルト" : "カスタム"}
                      </p>
                    </div>
                    <div className="btn-row">
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => setCategoryDraft({ id: category.id, name: category.name, type: category.type })}
                        type="button"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>edit</span>
                      </button>
                      <button
                        className="btn btn--del btn--sm"
                        onClick={() => void deleteCategory(category.id)}
                        type="button"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* カテゴリ追加・編集フォーム */}
          <div className="card form-stack">
            <p className="eyebrow">{categoryDraft.id ? "カテゴリを編集" : "カテゴリを追加"}</p>
            <div className="form-grid">
              <label className="field">
                <span className="field__label">カテゴリ名</span>
                <input
                  value={categoryDraft.name}
                  onChange={(e) => setCategoryDraft({ ...categoryDraft, name: e.target.value })}
                  placeholder="例: 外食"
                />
              </label>
              <label className="field">
                <span className="field__label">種別</span>
                <select value={categoryDraft.type} onChange={(e) => setCategoryDraft({ ...categoryDraft, type: e.target.value })}>
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
                <button
                  className="btn btn--out"
                  onClick={() => setCategoryDraft({ id: "", name: "", type: "EXPENSE" })}
                  type="button"
                >
                  キャンセル
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
