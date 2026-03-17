import { useEffect, useRef, useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { apiRequest } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { getAuthToken } from "../lib/storage";
import { useToast } from "../lib/toast";
import type { AppUser } from "../lib/types";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  setupCompleted: boolean;
  createdAt: string;
};

type ServiceDomain = {
  id: string;
  domain: string;
  enabled: boolean;
  createdAt: string;
};

type ServiceCategory = {
  id: string;
  code: "EC" | "PAYMENT";
  name: string;
  sortOrder: number;
  scheduleCount: number;
  domains: ServiceDomain[];
};

type VpnClient = {
  id: string;
  vpnIp: string;
  publicKey: string | null;
  status: "PENDING" | "ACTIVE" | "DISABLED";
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
};

type VpnPeer = {
  protocol: "IKEV2" | "WIREGUARD";
  identity: string;
  endpoint: string;
  assignedIp: string | null;
  connectedSince: string | null;
  lastSeen: string | null;
  isOnline: boolean;
  transferRx: number;
  transferTx: number;
};

type AdminPageProps = {
  user: AppUser;
  onLogout: () => Promise<void>;
};

export function AdminPage({ user, onLogout }: AdminPageProps) {
  const token = getAuthToken();
  const toast = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([]);
  const [vpnClients, setVpnClients] = useState<VpnClient[]>([]);
  const [systemInfo, setSystemInfo] = useState<{
    nodeVersion: string;
    platform: string;
    uptimeSec: number;
    dbReady: boolean;
  } | null>(null);

  const [openaiConfigured, setOpenaiConfigured] = useState(false);
  const [openaiKeyMasked, setOpenaiKeyMasked] = useState("");
  const [openaiKeyInput, setOpenaiKeyInput] = useState("");
  const [openaiSaving, setOpenaiSaving] = useState(false);
  const [pushTitle, setPushTitle] = useState("");
  const [pushMessage, setPushMessage] = useState("");
  const [pushSending, setPushSending] = useState(false);
  const [pushSubCount, setPushSubCount] = useState<number | null>(null);

  const [vpnPeers, setVpnPeers] = useState<VpnPeer[]>([]);
  const [vpnStatusSource, setVpnStatusSource] = useState("");
  const [vpnError, setVpnError] = useState("");
  const vpnIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [domainDraft, setDomainDraft] = useState({
    id: "",
    categoryCode: "EC" as "EC" | "PAYMENT",
    domain: "",
    enabled: true
  });
  const [vpnDraft, setVpnDraft] = useState({
    id: "",
    userId: "",
    vpnIp: "",
    publicKey: "",
    status: "PENDING" as "PENDING" | "ACTIVE" | "DISABLED"
  });

  const load = async () => {
    if (!token) return;
    const [usersData, systemData, configData, categoryData, vpnData] = await Promise.all([
      apiRequest<{ users: AdminUser[] }>("/api/admin/users", { token }),
      apiRequest<{ nodeVersion: string; platform: string; uptimeSec: number; dbReady: boolean }>("/api/admin/system-info", { token }),
      apiRequest<{ openaiConfigured: boolean; openaiApiKeyMasked: string }>("/api/admin/config", { token }).catch(() => ({ openaiConfigured: false, openaiApiKeyMasked: "" })),
      apiRequest<{ categories: ServiceCategory[] }>("/api/admin/service-categories", { token }),
      apiRequest<{ clients: VpnClient[] }>("/api/admin/vpn-clients", { token })
    ]);
    setUsers(usersData.users);
    setSystemInfo(systemData);
    setOpenaiConfigured(configData.openaiConfigured);
    setOpenaiKeyMasked(configData.openaiApiKeyMasked ?? "");
    setServiceCategories(categoryData.categories);
    setVpnClients(vpnData.clients);
    setVpnDraft((current) => ({
      ...current,
      userId: current.userId || usersData.users.find((item) => item.role !== "ADMIN")?.id || usersData.users[0]?.id || ""
    }));
  };

  const loadPushSubCount = async () => {
    if (!token) return;
    try {
      const data = await apiRequest<{ count: number }>("/api/push/subscription-count", { token });
      setPushSubCount(data.count ?? null);
    } catch {
      // サポートされていない場合は無視
    }
  };

  const loadVpnStatus = async () => {
    if (!token) return;
    try {
      const data = await apiRequest<{ peers: VpnPeer[]; source?: string; error?: string }>("/api/admin/vpn-status", { token });
      setVpnPeers(data.peers ?? []);
      setVpnStatusSource(data.source ?? "");
      setVpnError(data.error ?? "");
    } catch {
      setVpnError("VPN 状態を取得できませんでした");
    }
  };

  useEffect(() => {
    void load();
    void loadPushSubCount();
    void loadVpnStatus();
  }, [token]);

  useEffect(() => {
    vpnIntervalRef.current = setInterval(() => { void loadVpnStatus(); }, 30000);
    return () => { if (vpnIntervalRef.current) clearInterval(vpnIntervalRef.current); };
  }, [token]);

  const toggleStatus = async (targetUser: AdminUser) => {
    if (!token) return;
    await apiRequest(`/api/admin/users/${targetUser.id}/suspend`, {
      method: "POST", token, body: { status: targetUser.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" }
    });
    await load();
  };

  const saveOpenaiKey = async () => {
    if (!token) return;
    setOpenaiSaving(true);
    try {
      await apiRequest("/api/admin/config", { method: "PUT", token, body: { openaiApiKey: openaiKeyInput } });
      toast(openaiKeyInput ? "APIキーを保存しました" : "APIキーを削除しました");
      setOpenaiKeyInput("");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "保存に失敗しました", "err");
    } finally {
      setOpenaiSaving(false);
    }
  };

  const deleteOpenaiKey = async () => {
    if (!token) return;
    setOpenaiSaving(true);
    try {
      await apiRequest("/api/admin/config", { method: "PUT", token, body: { openaiApiKey: "" } });
      toast("APIキーを削除しました");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "削除に失敗しました", "err");
    } finally {
      setOpenaiSaving(false);
    }
  };

  const saveDomain = async () => {
    if (!token || !domainDraft.domain.trim()) return;
    try {
      if (domainDraft.id) {
        await apiRequest(`/api/admin/service-domains/${domainDraft.id}`, {
          method: "PUT",
          token,
          body: {
            domain: domainDraft.domain,
            enabled: domainDraft.enabled
          }
        });
      } else {
        await apiRequest("/api/admin/service-domains", {
          method: "POST",
          token,
          body: {
            categoryCode: domainDraft.categoryCode,
            domain: domainDraft.domain,
            enabled: domainDraft.enabled
          }
        });
      }
      toast("ドメイン設定を更新しました");
      setDomainDraft({ id: "", categoryCode: "EC", domain: "", enabled: true });
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "保存に失敗しました", "err");
    }
  };

  const removeDomain = async (domainId: string) => {
    if (!token) return;
    try {
      await apiRequest(`/api/admin/service-domains/${domainId}`, {
        method: "DELETE",
        token
      });
      toast("ドメインを削除しました");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "削除に失敗しました", "err");
    }
  };

  const saveVpnClient = async () => {
    if (!token || !vpnDraft.userId || !vpnDraft.vpnIp.trim()) return;
    try {
      if (vpnDraft.id) {
        await apiRequest(`/api/admin/vpn-clients/${vpnDraft.id}`, {
          method: "PUT",
          token,
          body: vpnDraft
        });
      } else {
        await apiRequest("/api/admin/vpn-clients", {
          method: "POST",
          token,
          body: vpnDraft
        });
      }
      toast("VPNクライアントを更新しました");
      setVpnDraft({
        id: "",
        userId: users.find((item) => item.role !== "ADMIN")?.id || users[0]?.id || "",
        vpnIp: "",
        publicKey: "",
        status: "PENDING"
      });
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "保存に失敗しました", "err");
    }
  };

  const removeVpnClient = async (clientId: string) => {
    if (!token) return;
    try {
      await apiRequest(`/api/admin/vpn-clients/${clientId}`, {
        method: "DELETE",
        token
      });
      toast("VPNクライアントを削除しました");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "削除に失敗しました", "err");
    }
  };

  const sendPush = async () => {
    if (!token || !pushTitle.trim()) return;
    setPushSending(true);
    try {
      const data = await apiRequest<{ sent: number; total: number }>("/api/push/send", {
        method: "POST", token,
        body: { title: pushTitle, message: pushMessage, url: "/" }
      });
      toast(`${data.sent} / ${data.total} 件に送信しました`);
      setPushTitle(""); setPushMessage("");
    } catch (err) {
      toast(err instanceof Error ? err.message : "送信に失敗しました", "err");
    } finally {
      setPushSending(false);
    }
  };

  const adminCount = users.filter((u) => u.role === "ADMIN").length;
  const normalCount = users.filter((u) => u.role !== "ADMIN").length;

  const [adminTab, setAdminTab] = useState<"users" | "system" | "vpn" | "push">("users");

  return (
    <AppLayout
      onLogout={onLogout}
      subtitle="ユーザー状態とシステム設定を確認する管理画面です。"
      title="管理"
      user={user}
    >
      {/* ── Stats ─────────────────────────────────────── */}
      <div className="three-up">
        <div className="card">
          <div className="stat">
            <p className="stat__label">総ユーザー</p>
            <p className="stat__value">{users.length}</p>
          </div>
        </div>
        <div className="card">
          <div className="stat">
            <p className="stat__label">管理者</p>
            <p className="stat__value">{adminCount}</p>
          </div>
        </div>
        <div className="card">
          <div className="stat">
            <p className="stat__label">一般ユーザー</p>
            <p className="stat__value">{normalCount}</p>
          </div>
        </div>
      </div>

      {/* ── Sub-tabs ──────────────────────────────────── */}
      <div className="seg" style={{ flexWrap: "wrap" }}>
        <button className={`seg__btn ${adminTab === "users" ? "on" : ""}`} onClick={() => setAdminTab("users")} type="button">ユーザー</button>
        <button className={`seg__btn ${adminTab === "system" ? "on" : ""}`} onClick={() => setAdminTab("system")} type="button">システム</button>
        <button className={`seg__btn ${adminTab === "vpn" ? "on" : ""}`} onClick={() => setAdminTab("vpn")} type="button">VPN</button>
        <button className={`seg__btn ${adminTab === "push" ? "on" : ""}`} onClick={() => setAdminTab("push")} type="button">プッシュ通知</button>
      </div>

      {/* ── Users tab ─────────────────────────────────── */}
      {adminTab === "users" ? (
        <div className="two-up">
          <div className="card">
            <p className="eyebrow">ユーザー状態</p>
            {users.map((item) => (
              <div className="mini-row" key={item.id}>
                <div className="mini-row__body">
                  <strong>{item.name}</strong>
                  <p>{item.email}</p>
                  <p>
                    {item.role} ·{" "}
                    <span className={item.status === "ACTIVE" ? "entry__amount--positive" : "entry__amount--negative"}>
                      {item.status}
                    </span>
                    {" · "}
                    {item.setupCompleted ? "セットアップ済" : "未完了"}
                  </p>
                  <p>{formatDateTime(item.createdAt)}</p>
                </div>
                {item.role !== "ADMIN" ? (
                  <button
                    className={item.status === "ACTIVE" ? "btn btn--del btn--sm" : "btn btn--out btn--sm"}
                    onClick={() => void toggleStatus(item)}
                    type="button"
                  >
                    {item.status === "ACTIVE" ? "停止" : "再開"}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <div className="card">
            <p className="eyebrow">システム状態</p>
            {[
              ["Node.js", systemInfo?.nodeVersion ?? "-"],
              ["Platform", systemInfo?.platform ?? "-"],
              ["Uptime", `${systemInfo?.uptimeSec ?? 0}s`],
              ["Database", systemInfo?.dbReady ? "ready" : "not ready"]
            ].map(([label, value]) => (
              <div className="mini-row" key={label}>
                <div className="mini-row__body">
                  <strong>{label}</strong>
                </div>
                <span className={`text-mono text-sm ${label === "Database" && value === "ready" ? "entry__amount--positive" : ""}`}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── System tab ────────────────────────────────── */}
      {adminTab === "system" ? (
        <>
          <div className="card form-stack">
            <div className="row row--spread">
              <div>
                <p className="eyebrow">OpenAI API キー</p>
                <p className="text-sm">AIチャット・AIレポートに使用します。設定しない場合はフォールバック応答を返します。</p>
              </div>
              <span className={`badge ${openaiConfigured ? "badge--in" : ""}`}>
                {openaiConfigured ? "設定済" : "未設定"}
              </span>
            </div>
            {openaiConfigured && openaiKeyMasked ? (
              <div className="card">
                <code className="text-mono text-sm">{openaiKeyMasked}</code>
              </div>
            ) : null}
            <label className="field">
              <span className="field__label">
                {openaiConfigured ? "キーを変更する（新しいキーを入力）" : "APIキーを入力"}
              </span>
              <input
                type="password"
                value={openaiKeyInput}
                onChange={(e) => setOpenaiKeyInput(e.target.value)}
                placeholder="sk-proj-..."
              />
            </label>
            <div className="btn-row">
              <button className="btn btn--fill btn--sm" disabled={openaiSaving} onClick={() => void saveOpenaiKey()} type="button">
                {openaiSaving ? "保存中..." : "保存する"}
              </button>
              {openaiConfigured ? (
                <button className="btn btn--del btn--sm" disabled={openaiSaving} onClick={() => void deleteOpenaiKey()} type="button">
                  キーを削除
                </button>
              ) : null}
            </div>
          </div>

          <div className="two-up">
            <div className="card form-stack">
              <div className="row row--spread row--wrap">
                <div>
                  <p className="eyebrow">サービスカテゴリ</p>
                  <p className="text-sm">ユーザーにはカテゴリだけを見せ、実ドメインはここで管理します。</p>
                </div>
              </div>
              {serviceCategories.map((category) => (
                <div className="card form-stack" key={category.id}>
                  <div className="row row--spread row--wrap">
                    <div>
                      <p className="text-title">{category.name}</p>
                      <p className="text-meta">
                        コード {category.code} · ドメイン {category.domains.length}件 · 利用中スケジュール {category.scheduleCount}件
                      </p>
                    </div>
                  </div>
                  {category.domains.length ? (
                    category.domains.map((domain) => (
                      <div className="mini-row" key={domain.id}>
                        <div className="mini-row__body">
                          <strong>{domain.domain}</strong>
                          <p>{domain.enabled ? "有効" : "無効"}</p>
                        </div>
                        <div className="btn-row">
                          <button
                            className="btn btn--out btn--sm"
                            onClick={() =>
                              setDomainDraft({
                                id: domain.id,
                                categoryCode: category.code,
                                domain: domain.domain,
                                enabled: domain.enabled
                              })
                            }
                            type="button"
                          >
                            編集
                          </button>
                          <button className="btn btn--del btn--sm" onClick={() => void removeDomain(domain.id)} type="button">
                            削除
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm">まだドメインがありません。</p>
                  )}
                </div>
              ))}
            </div>

            <div className="card form-stack">
              <p className="eyebrow">{domainDraft.id ? "ドメインを編集" : "ドメインを追加"}</p>
              <div className="form-grid">
                <label className="field">
                  <span className="field__label">カテゴリ</span>
                  <select
                    value={domainDraft.categoryCode}
                    onChange={(event) =>
                      setDomainDraft((current) => ({
                        ...current,
                        categoryCode: event.target.value as "EC" | "PAYMENT"
                      }))
                    }
                  >
                    {serviceCategories.map((category) => (
                      <option key={category.id} value={category.code}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">ドメイン</span>
                  <input
                    value={domainDraft.domain}
                    onChange={(event) =>
                      setDomainDraft((current) => ({
                        ...current,
                        domain: event.target.value
                      }))
                    }
                    placeholder="example.com"
                  />
                </label>
                <label className="toggle-row field--wide">
                  <input
                    checked={domainDraft.enabled}
                    onChange={(event) =>
                      setDomainDraft((current) => ({
                        ...current,
                        enabled: event.target.checked
                      }))
                    }
                    type="checkbox"
                  />
                  このドメインを有効にする
                </label>
              </div>
              <div className="btn-row">
                <button className="btn btn--fill" onClick={() => void saveDomain()} type="button">
                  保存する
                </button>
                {domainDraft.id ? (
                  <button
                    className="btn btn--out"
                    onClick={() => setDomainDraft({ id: "", categoryCode: "EC", domain: "", enabled: true })}
                    type="button"
                  >
                    キャンセル
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </>
      ) : null}

      {/* ── VPN tab ───────────────────────────────────── */}
      {adminTab === "vpn" ? (
        <>
          <div className="two-up">
            <div className="card form-stack">
              <div>
                <p className="eyebrow">VPNクライアント</p>
                <p className="text-sm">VPN IP とユーザーを紐付けて、実行エンジン側から参照できるようにします。</p>
              </div>
              {vpnClients.length ? (
                vpnClients.map((client) => (
                  <div className="mini-row" key={client.id}>
                    <div className="mini-row__body">
                      <strong>{client.user.name}</strong>
                      <p>{client.user.email}</p>
                      <p>{client.vpnIp} · {client.status}</p>
                      {client.publicKey ? <p className="text-mono text-xs">{client.publicKey}</p> : null}
                    </div>
                    <div className="btn-row">
                      <button
                        className="btn btn--out btn--sm"
                        onClick={() =>
                          setVpnDraft({
                            id: client.id,
                            userId: client.user.id,
                            vpnIp: client.vpnIp,
                            publicKey: client.publicKey ?? "",
                            status: client.status
                          })
                        }
                        type="button"
                      >
                        編集
                      </button>
                      <button className="btn btn--del btn--sm" onClick={() => void removeVpnClient(client.id)} type="button">
                        削除
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm">まだ登録がありません。</p>
              )}
            </div>

            <div className="card form-stack">
              <p className="eyebrow">{vpnDraft.id ? "VPNクライアントを編集" : "VPNクライアントを追加"}</p>
              <div className="form-grid">
                <label className="field">
                  <span className="field__label">ユーザー</span>
                  <select
                    value={vpnDraft.userId}
                    onChange={(event) =>
                      setVpnDraft((current) => ({
                        ...current,
                        userId: event.target.value
                      }))
                    }
                  >
                    {users.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.email})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">VPN IP</span>
                  <input
                    value={vpnDraft.vpnIp}
                    onChange={(event) =>
                      setVpnDraft((current) => ({
                        ...current,
                        vpnIp: event.target.value
                      }))
                    }
                    placeholder="10.66.66.2"
                  />
                </label>
                <label className="field">
                  <span className="field__label">公開鍵</span>
                  <input
                    value={vpnDraft.publicKey}
                    onChange={(event) =>
                      setVpnDraft((current) => ({
                        ...current,
                        publicKey: event.target.value
                      }))
                    }
                    placeholder="EAP ユーザー名 / 公開鍵"
                  />
                </label>
                <label className="field">
                  <span className="field__label">状態</span>
                  <select
                    value={vpnDraft.status}
                    onChange={(event) =>
                      setVpnDraft((current) => ({
                        ...current,
                        status: event.target.value as "PENDING" | "ACTIVE" | "DISABLED"
                      }))
                    }
                  >
                    <option value="PENDING">PENDING</option>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="DISABLED">DISABLED</option>
                  </select>
                </label>
              </div>
              <div className="btn-row">
                <button className="btn btn--fill" onClick={() => void saveVpnClient()} type="button">
                  保存する
                </button>
                {vpnDraft.id ? (
                  <button
                    className="btn btn--out"
                    onClick={() =>
                      setVpnDraft({
                        id: "",
                        userId: users.find((item) => item.role !== "ADMIN")?.id || users[0]?.id || "",
                        vpnIp: "",
                        publicKey: "",
                        status: "PENDING"
                      })
                    }
                    type="button"
                  >
                    キャンセル
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {/* VPN connection status */}
          <div className="card form-stack">
            <div className="row row--spread">
              <div>
                <p className="eyebrow">VPN 接続状況</p>
                <p className="text-sm">
                  IKEv2 と WireGuard の接続状況を 30 秒ごとに更新します。
                  {vpnStatusSource ? ` 現在の監視元: ${vpnStatusSource}` : ""}
                </p>
              </div>
              <button className="btn btn--out btn--sm" onClick={() => void loadVpnStatus()} type="button">
                更新
              </button>
            </div>
            {vpnError ? (
              <p className="text-sm" style={{ color: "var(--danger)" }}>{vpnError}</p>
            ) : null}
            {vpnPeers.length ? (
              vpnPeers.map((peer) => (
                <div className="mini-row" key={`${peer.protocol}:${peer.identity}:${peer.endpoint}`}>
                  <div className="mini-row__body">
                    <strong style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ color: peer.isOnline ? "var(--brand)" : "var(--danger)", fontSize: "10px" }}>●</span>
                      {peer.assignedIp ?? peer.identity}
                    </strong>
                    <p>{peer.protocol === "IKEV2" ? "IKEv2" : "WireGuard"} / {peer.identity}</p>
                    <p>{peer.endpoint || "—"}</p>
                    <p>
                      {peer.lastSeen
                        ? `最終接続: ${formatDateTime(peer.lastSeen)}`
                        : peer.connectedSince
                          ? `接続継続: ${peer.connectedSince}`
                          : "未接続"}
                    </p>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    {peer.protocol === "WIREGUARD" ? (
                      <>
                        <p className="text-sm">↓ {(peer.transferRx / 1024 / 1024).toFixed(1)} MB</p>
                        <p className="text-sm">↑ {(peer.transferTx / 1024 / 1024).toFixed(1)} MB</p>
                      </>
                    ) : (
                      <p className="text-sm">{peer.isOnline ? "接続中" : "未接続"}</p>
                    )}
                  </div>
                </div>
              ))
            ) : !vpnError ? (
              <p className="text-sm">ピアが見つかりません。</p>
            ) : null}
          </div>
        </>
      ) : null}

      {/* ── Push tab ──────────────────────────────────── */}
      {adminTab === "push" ? (
        <div className="card form-stack">
          <div className="row row--spread">
            <div>
              <p className="eyebrow">プッシュ通知を送信</p>
              <p className="text-sm">すべての購読者に通知を送信します。</p>
            </div>
            {pushSubCount !== null ? (
              <span className="badge badge--in">{pushSubCount} 購読者</span>
            ) : null}
          </div>
          <div className="form-grid">
            <label className="field field--wide">
              <span className="field__label">タイトル</span>
              <input value={pushTitle} onChange={(e) => setPushTitle(e.target.value)} placeholder="通知のタイトル" />
            </label>
            <label className="field field--wide">
              <span className="field__label">メッセージ</span>
              <textarea
                value={pushMessage}
                onChange={(e) => setPushMessage(e.target.value)}
                placeholder="通知の本文"
                rows={3}
                style={{ resize: "vertical" }}
              />
            </label>
          </div>
          <div className="btn-row">
            <button
              className="btn btn--fill btn--sm"
              disabled={pushSending || !pushTitle.trim()}
              onClick={() => void sendPush()}
              type="button"
            >
              {pushSending ? "送信中..." : "送信する"}
            </button>
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
