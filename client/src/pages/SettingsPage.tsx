import { useEffect, useState } from "react";
import { useApiStatus } from "../lib/useApiStatus";

import { AppLayout } from "../components/AppLayout";
import { APP_BUILD_ID, APP_VERSION, forceRefreshApp } from "../lib/appMeta";
import { TimeField } from "../components/TemporalFields";
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

type SettingsTab = "profile" | "mail" | "notifications" | "vpn" | "categories" | "version" | "danger";

type MailboxData = {
  address: string;
  status: string;
  receivedCount7d: number;
  candidateCount7d: number;
};

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
  { id: "mail",          label: "メール",   icon: "mail" },
  { id: "notifications", label: "通知",     icon: "notifications" },
  { id: "vpn",           label: "VPN",      icon: "vpn_key" },
  { id: "categories",    label: "カテゴリ", icon: "label" },
  { id: "version",       label: "バージョン", icon: "system_update" },
  { id: "danger",        label: "アカウント", icon: "manage_accounts" }
];

const STATUS_CONFIG = {
  ok:          { color: "#059669", bg: "#ECFDF5", label: "全システム正常" },
  degraded:    { color: "#D97706", bg: "#FFFBEB", label: "一部障害" },
  unreachable: { color: "#DC2626", bg: "#FEF2F2", label: "接続不可" },
  loading:     { color: "#94A3B8", bg: "#F1F5F9", label: "確認中..." },
} as const;

function VersionTab() {
  const [swStatus, setSwStatus] = useState<"checking" | "available" | "latest">("checking");
  const apiStatus = useApiStatus();
  const cfg = STATUS_CONFIG[apiStatus];

  useEffect(() => {
    const check = async () => {
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        setSwStatus(reg?.waiting ? "available" : "latest");
      } catch {
        setSwStatus("latest");
      }
    };
    void check();
  }, []);

  return (
    <div className="form-stack">
      {/* システムステータス */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: cfg.bg, border: `1px solid ${cfg.color}33`,
        borderRadius: 12, padding: "12px 16px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%", background: cfg.color, flexShrink: 0,
            ...(apiStatus === "ok" ? { animation: "statusPulse 2.5s ease-in-out infinite" } : {})
          }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {([["API", true], ["DB", apiStatus === "ok"]] as [string, boolean][]).map(([name, up]) => (
            <span key={name} style={{ fontSize: 11, color: up ? "#059669" : "#DC2626", fontWeight: 500 }}>
              {name} {up ? "●" : "○"}
            </span>
          ))}
        </div>
      </div>

      <div className="card form-stack">
        <p className="eyebrow">アプリ情報</p>
        <div className="mini-row">
          <span className="mini-row__label">バージョン</span>
          <span className="mini-row__value">{APP_VERSION}</span>
        </div>
        <div className="mini-row">
          <span className="mini-row__label">ビルドID</span>
          <span className="mini-row__value" style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}>{APP_BUILD_ID}</span>
        </div>
      </div>
      <div className="card form-stack">
        <p className="eyebrow">アップデート</p>
        {swStatus === "checking" ? (
          <p style={{ fontSize: "13px", color: "var(--text-2)" }}>確認中...</p>
        ) : swStatus === "available" ? (
          <p style={{ fontSize: "13px", color: "var(--brand)", fontWeight: 600 }}>
            <span className="material-symbols-outlined" style={{ fontSize: "16px", verticalAlign: "middle", marginRight: 4 }}>new_releases</span>
            新しいバージョンがあります
          </p>
        ) : (
          <p style={{ fontSize: "13px", color: "var(--text-2)" }}>現在は最新バージョンです</p>
        )}
        <div className="btn-row">
          <button
            className="btn btn--fill"
            onClick={() => void forceRefreshApp()}
            type="button"
          >
            <span className="material-symbols-outlined">system_update</span>
            最新化する
          </button>
        </div>
      </div>
    </div>
  );
}

function TestMailButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<"ok" | "err" | null>(null);
  const handleClick = async () => {
    setLoading(true);
    setResult(null);
    try {
      const token = getAuthToken();
      await apiRequest("/api/users/me/test-notification-mail", { method: "POST", token });
      setResult("ok");
    } catch {
      setResult("err");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <button className="btn btn--out" disabled={loading} onClick={() => void handleClick()} type="button">
        {loading ? "送信中..." : "テストメールを送信"}
      </button>
      {result === "ok" && <p style={{ fontSize: "13px", color: "var(--emerald)" }}>送信しました。メールを確認してください。</p>}
      {result === "err" && <p style={{ fontSize: "13px", color: "var(--red)" }}>送信に失敗しました。サーバーログを確認してください。</p>}
    </div>
  );
}

// ─── DangerTab ────────────────────────────────────────────────────────────────

const RESET_ITEMS: { key: string; label: string; desc: string; disabled?: boolean }[] = [
  { key: "records",       label: "家計簿の記録",     desc: "収入・支出・貯金の全記録を削除" },
  { key: "transfers",     label: "口座移動の記録",   desc: "口座間の移動履歴を削除" },
  { key: "accounts",      label: "口座",             desc: "全口座と関連する記録をまとめて削除" },
  { key: "goals",         label: "目標",             desc: "全ての貯金目標を削除" },
  { key: "categories",    label: "カテゴリ",         desc: "全カテゴリを削除" },
  { key: "impulse",       label: "保留リスト",       desc: "衝動買い保留アイテムを削除" },
  { key: "candidates",    label: "候補インボックス", desc: "未処理の候補データを削除" },
  { key: "mailbox",       label: "受信メール",       desc: "受信メールの履歴を削除" },
  { key: "notifications", label: "通知履歴",         desc: "アプリ内の通知ログを削除" },
  { key: "__account_info__", label: "アカウント情報", desc: "名前・メール・パスワードなど（変更不可）", disabled: true },
];

function DangerTab({ token, onLogout }: { token: string | null; onLogout?: () => Promise<void> }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmText, setConfirmText] = useState("");
  const [deleteMode, setDeleteMode] = useState<"reset" | "account" | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const execReset = async () => {
    if (!token || selected.size === 0) return;
    if (confirmText !== "リセット") return;
    setLoading(true);
    try {
      await apiRequest("/api/users/me/reset", {
        method: "POST", token,
        body: { targets: Array.from(selected), confirm: confirmText }
      });
      setResult("選択したデータをリセットしました。");
      setSelected(new Set());
      setConfirmText("");
      setDeleteMode(null);
    } catch (e) {
      setResult(e instanceof Error ? e.message : "失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const execDeleteAccount = async () => {
    if (!token) return;
    if (confirmText !== "アカウントを削除") return;
    setLoading(true);
    try {
      await apiRequest("/api/users/me", {
        method: "DELETE", token,
        body: { confirm: confirmText }
      });
      await onLogout?.();
    } catch (e) {
      setResult(e instanceof Error ? e.message : "失敗しました");
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* 部分リセット */}
      <div className="card">
        <p className="eyebrow" style={{ marginBottom: "4px" }}>データのリセット</p>
        <p style={{ fontSize: "13px", color: "var(--text-2)", marginBottom: "16px" }}>
          削除したいデータを選択してください。アカウント情報は変更できません。
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {RESET_ITEMS.map((item) => (
            <label
              key={item.key}
              className={`toggle-row${item.disabled ? " toggle-row--disabled" : ""}`}
              style={{ opacity: item.disabled ? 0.4 : 1, cursor: item.disabled ? "not-allowed" : "pointer" }}
            >
              <input
                type="checkbox"
                checked={selected.has(item.key)}
                disabled={item.disabled}
                onChange={() => !item.disabled && toggle(item.key)}
              />
              <span style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                <span style={{ fontWeight: 600, fontSize: "14px" }}>{item.label}</span>
                <span style={{ fontSize: "11px", color: "var(--text-3)" }}>{item.desc}</span>
              </span>
            </label>
          ))}
        </div>

        {selected.size > 0 && deleteMode !== "account" && (
          <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {deleteMode !== "reset" ? (
              <button className="btn btn--del" type="button" onClick={() => { setDeleteMode("reset"); setConfirmText(""); }}>
                <span className="material-symbols-outlined">delete_sweep</span>
                選択した {selected.size} 項目を削除する
              </button>
            ) : (
              <>
                <p style={{ fontSize: "13px", color: "var(--coral)" }}>
                  確認のため「<strong>リセット</strong>」と入力してください。この操作は取り消せません。
                </p>
                <input
                  className="field"
                  placeholder="リセット"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                />
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    className="btn btn--del"
                    disabled={confirmText !== "リセット" || loading}
                    type="button"
                    onClick={() => void execReset()}
                  >
                    {loading ? "削除中..." : "削除する"}
                  </button>
                  <button className="btn btn--out" type="button" onClick={() => { setDeleteMode(null); setConfirmText(""); }}>
                    キャンセル
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {result && <p style={{ fontSize: "13px", color: "var(--emerald)", marginTop: "12px" }}>{result}</p>}
      </div>

      {/* アカウント完全削除 */}
      <div className="card" style={{ borderColor: "#fecaca" }}>
        <p className="eyebrow" style={{ marginBottom: "4px", color: "var(--coral)" }}>アカウントの削除</p>
        <p style={{ fontSize: "13px", color: "var(--text-2)", marginBottom: "16px" }}>
          アカウントとすべてのデータを完全に削除します。この操作は取り消せません。
        </p>

        {deleteMode !== "account" ? (
          <button className="btn btn--del" type="button" onClick={() => { setDeleteMode("account"); setConfirmText(""); setResult(null); }}>
            <span className="material-symbols-outlined">person_remove</span>
            アカウントを削除する
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <p style={{ fontSize: "13px", color: "var(--coral)" }}>
              確認のため「<strong>アカウントを削除</strong>」と入力してください。
            </p>
            <input
              className="field"
              placeholder="アカウントを削除"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                className="btn btn--del"
                disabled={confirmText !== "アカウントを削除" || loading}
                type="button"
                onClick={() => void execDeleteAccount()}
              >
                {loading ? "削除中..." : "完全に削除する"}
              </button>
              <button className="btn btn--out" type="button" onClick={() => { setDeleteMode(null); setConfirmText(""); }}>
                キャンセル
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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
  const [mailbox, setMailbox] = useState<MailboxData | null>(null);
  const [mailboxLoading, setMailboxLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "err" | null>(null);

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
      if (platform === "ios" || platform === "mac") {
        window.location.href = data.mobileconfigUrl;
      }
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

  const loadMailbox = async () => {
    if (!token) return;
    try {
      const data = await apiRequest<MailboxData>("/api/users/me/mailbox", { token });
      setMailbox(data);
    } catch { /* ignore */ }
  };

  const regenerateMailbox = async () => {
    if (!token) return;
    setMailboxLoading(true);
    try {
      const data = await apiRequest<{ address: string; status: string }>("/api/users/me/mailbox/regenerate", { method: "POST", token });
      setMailbox((prev) => prev ? { ...prev, address: data.address } : null);
      toast("受信アドレスを再発行しました");
    } catch {
      toast("再発行に失敗しました", "err");
    } finally {
      setMailboxLoading(false);
    }
  };

  const copyAddress = () => {
    if (!mailbox) return;
    void navigator.clipboard.writeText(mailbox.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const sendTestMail = async () => {
    if (!token) return;
    setTestSending(true);
    setTestResult(null);
    try {
      await apiRequest("/api/users/me/mailbox/test", { method: "POST", token });
      setTestResult("ok");
      toast("テストメールを送信しました。数秒後にインボックスを確認してください", "ok");
    } catch {
      setTestResult("err");
      toast("テストメールの送信に失敗しました", "err");
    } finally {
      setTestSending(false);
    }
  };

  useEffect(() => { void loadSettings(); void loadVpnDevices(); void loadMailbox(); }, [token]);

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

      {/* ══════════════ TAB: メール ══════════════ */}
      {activeTab === "mail" ? (
        <div className="form-stack">
          {/* 専用受信アドレス */}
          <div className="card form-stack">
            <p className="eyebrow">専用受信アドレス</p>
            <p style={{ fontSize: "13px", color: "var(--text-2)", lineHeight: 1.6 }}>
              銀行・カード・決済サービスからの通知メールをこのアドレスに転送すると、自動で候補に変換されます。
            </p>
            {mailbox ? (
              <>
                <div className="settings-mailbox-address">
                  <code className="settings-mailbox-code">{mailbox.address}</code>
                </div>
                <div className="btn-row">
                  <button
                    className="btn btn--fill btn--sm"
                    onClick={copyAddress}
                    type="button"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                      {copied ? "check" : "content_copy"}
                    </span>
                    {copied ? "コピーしました" : "コピー"}
                  </button>
                  <button
                    className="btn btn--out btn--sm"
                    disabled={mailboxLoading}
                    onClick={() => void regenerateMailbox()}
                    type="button"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>refresh</span>
                    {mailboxLoading ? "再発行中..." : "再発行"}
                  </button>
                </div>
              </>
            ) : (
              <p style={{ fontSize: "13px", color: "var(--text-3)" }}>読み込み中...</p>
            )}
          </div>

          {/* メール取込状況 */}
          <div className="card form-stack">
            <p className="eyebrow">メール取込状況（直近7日）</p>
            {mailbox ? (
              <div className="two-up">
                <div className="stat">
                  <p className="stat__value">{mailbox.receivedCount7d}</p>
                  <p className="stat__label">受信件数</p>
                </div>
                <div className="stat">
                  <p className="stat__value stat__value--jade">{mailbox.candidateCount7d}</p>
                  <p className="stat__label">候補化件数</p>
                </div>
              </div>
            ) : null}
          </div>

          {/* 接続テスト */}
          <div className="card form-stack">
            <p className="eyebrow">接続テスト</p>
            <p style={{ fontSize: "13px", color: "var(--text-2)", lineHeight: 1.6 }}>
              専用アドレスにテストメールを送信して、受信パイプラインが正常に動作するか確認できます。
            </p>
            {testResult === "ok" && (
              <p className="ok-msg">
                <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>check_circle</span>
                テストメールを送信しました。数秒後に候補インボックスに届きます。
              </p>
            )}
            {testResult === "err" && (
              <p className="err-msg">送信に失敗しました。Postfix が起動しているか確認してください。</p>
            )}
            <button
              className="btn btn--out btn--sm"
              disabled={testSending || !mailbox}
              onClick={() => void sendTestMail()}
              type="button"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>send</span>
              {testSending ? "送信中..." : "テストメールを送信"}
            </button>
          </div>

          {/* 転送方法の案内 */}
          <div className="card form-stack">
            <p className="eyebrow">転送の設定方法</p>
            <ol style={{ paddingLeft: "1.5em", fontSize: "13px", lineHeight: 1.8, color: "var(--text-2)" }}>
              <li>上の専用アドレスをコピーする</li>
              <li>銀行・カードの通知メール設定を開く</li>
              <li>「転送先」または「自動転送」に専用アドレスを登録する</li>
              <li>通知が届くと自動で候補インボックスに追加されます</li>
            </ol>
            <p style={{ fontSize: "12px", color: "var(--text-3)" }}>
              ※ 転送のみ対応。送信や返信はできません。
            </p>
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
                  ["weeklySummary", "週次サマリー（毎週末）"],
                  ["goalNotification", "目標通知（毎週末）"],
                  ["deficitAlert", "赤字アラート（毎週末）"]
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

          {/* メール送信テスト */}
          <div className="card form-stack">
            <p className="eyebrow">メール送信テスト</p>
            <p style={{ fontSize: "13px", color: "var(--text-2)" }}>
              登録メールアドレスに通知メールが届くか確認します。
            </p>
            <TestMailButton />
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
              プロファイルを入れるだけで VPN、CA 証明書、ホーム画面用の貯めログ Web アプリがまとめて追加されます。追加アプリは不要です。
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
              {vpnLoading ? "生成中..." : "このデバイスに作成してそのままインストール"}
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
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => {
                    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
                      e.preventDefault();
                      window.location.href = vpnSetupData.mobileconfigUrl;
                    }
                  }}
                >
                  <span className="material-symbols-outlined">download</span>
                  プロファイルをダウンロード
                </a>
                <p style={{ fontSize: "12px", color: "var(--text-3)" }}>
                  ※ iPhone / iPad は Safari で開くとそのままインストールに進めます
                </p>

                {vpnSetupData.platform === "ios" ? (
                  <ol style={{ paddingLeft: "1.5em", fontSize: "13px", lineHeight: 1.7, color: "var(--text-2)", display: "flex", flexDirection: "column", gap: "4px" }}>
                    <li>上のボタンをタップするとプロファイルのダウンロードが始まります</li>
                    <li>「設定」→「プロファイルがダウンロードされました」→「インストール」</li>
                    <li>VPN と Web アプリ用アイコンが追加されます</li>
                    <li>「設定」→「VPN」から接続 / 切断できます</li>
                  </ol>
                ) : vpnSetupData.platform === "mac" ? (
                  <ol style={{ paddingLeft: "1.5em", fontSize: "13px", lineHeight: 1.7, color: "var(--text-2)", display: "flex", flexDirection: "column", gap: "4px" }}>
                    <li>上のボタンをクリックして .mobileconfig をダウンロード</li>
                    <li>ダブルクリック → システム設定 →「プロファイル」→「インストール」</li>
                    <li>VPN と Web アプリのショートカットが追加されます</li>
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
                    <TimeField
                      label="開始"
                      onChange={(value) => updateSchedule(schedule.categoryCode, (s) => ({ ...s, startTime: value }))}
                      value={schedule.startTime}
                    />
                    <TimeField
                      label="終了"
                      onChange={(value) => updateSchedule(schedule.categoryCode, (s) => ({ ...s, endTime: value }))}
                      value={schedule.endTime}
                    />
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

      {/* ══════════════ TAB: バージョン ══════════════ */}
      {activeTab === "version" ? (
        <VersionTab />
      ) : null}

      {/* ══════════════ TAB: アカウント管理 ══════════════ */}
      {activeTab === "danger" ? (
        <DangerTab token={token} onLogout={onLogout} />
      ) : null}
    </AppLayout>
  );
}
