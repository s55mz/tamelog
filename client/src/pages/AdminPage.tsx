import { useEffect, useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { Feedback } from "../components/ui";
import { apiRequest } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { getAuthToken } from "../lib/storage";
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

type AdminPageProps = {
  user: AppUser;
  onLogout: () => Promise<void>;
};

export function AdminPage({ user, onLogout }: AdminPageProps) {
  const token = getAuthToken();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [systemInfo, setSystemInfo] = useState<{
    nodeVersion: string;
    platform: string;
    uptimeSec: number;
    dbReady: boolean;
  } | null>(null);

  // OpenAI config
  const [openaiConfigured, setOpenaiConfigured] = useState(false);
  const [openaiKeyMasked, setOpenaiKeyMasked] = useState("");
  const [openaiKeyInput, setOpenaiKeyInput] = useState("");
  const [openaiSaving, setOpenaiSaving] = useState(false);
  const [openaiMsg, setOpenaiMsg] = useState("");
  const [openaiErr, setOpenaiErr] = useState("");

  const load = async () => {
    if (!token) return;
    const [usersData, systemData, configData] = await Promise.all([
      apiRequest<{ users: AdminUser[] }>("/api/admin/users", { token }),
      apiRequest<{ nodeVersion: string; platform: string; uptimeSec: number; dbReady: boolean }>("/api/admin/system-info", { token }),
      apiRequest<{ openaiConfigured: boolean; openaiApiKeyMasked: string }>("/api/admin/config", { token }).catch(() => ({ openaiConfigured: false, openaiApiKeyMasked: "" }))
    ]);
    setUsers(usersData.users);
    setSystemInfo(systemData);
    setOpenaiConfigured(configData.openaiConfigured);
    setOpenaiKeyMasked(configData.openaiApiKeyMasked ?? "");
  };

  useEffect(() => { void load(); }, [token]);

  const toggleStatus = async (targetUser: AdminUser) => {
    if (!token) return;
    await apiRequest(`/api/admin/users/${targetUser.id}/suspend`, {
      method: "POST",
      token,
      body: { status: targetUser.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" }
    });
    await load();
  };

  const saveOpenaiKey = async () => {
    if (!token) return;
    setOpenaiSaving(true);
    setOpenaiMsg("");
    setOpenaiErr("");
    try {
      await apiRequest("/api/admin/config", {
        method: "PUT",
        token,
        body: { openaiApiKey: openaiKeyInput }
      });
      setOpenaiMsg(openaiKeyInput ? "APIキーを保存しました。" : "APIキーを削除しました。");
      setOpenaiKeyInput("");
      await load();
    } catch (err) {
      setOpenaiErr(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setOpenaiSaving(false);
    }
  };

  const adminCount = users.filter((u) => u.role === "ADMIN").length;
  const normalCount = users.filter((u) => u.role !== "ADMIN").length;

  return (
    <AppLayout onLogout={onLogout} title="管理" user={user}>
      {/* ── Stats ─────────────────────────────────────── */}
      <div className="three-up">
        <div className="card"><div className="stat"><p className="stat__label">総ユーザー</p><p className="stat__value">{users.length}</p></div></div>
        <div className="card"><div className="stat"><p className="stat__label">管理者</p><p className="stat__value">{adminCount}</p></div></div>
        <div className="card"><div className="stat"><p className="stat__label">一般ユーザー</p><p className="stat__value">{normalCount}</p></div></div>
      </div>

      {/* ── OpenAI API key ────────────────────────────── */}
      <div className="card form-stack">
        <div className="row row--spread">
          <div>
            <p className="eyebrow">OpenAI API キー</p>
            <p style={{ fontSize: "12px", color: "var(--text-2)", marginTop: "4px" }}>
              AIチャット・AIレポートに使用します。設定しない場合はフォールバック応答を返します。
            </p>
          </div>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "4px 10px",
            borderRadius: "var(--r2)",
            background: openaiConfigured ? "#1DC99A18" : "var(--bg-2)",
            border: `1px solid ${openaiConfigured ? "var(--jade)" : "var(--border)"}`,
            fontSize: "12px",
            fontWeight: 600,
            color: openaiConfigured ? "var(--jade)" : "var(--text-2)",
            flexShrink: 0
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
              {openaiConfigured ? "check_circle" : "radio_button_unchecked"}
            </span>
            {openaiConfigured ? "設定済" : "未設定"}
          </div>
        </div>

        {openaiConfigured && openaiKeyMasked ? (
          <div style={{
            padding: "var(--s3)",
            background: "var(--bg-2)",
            borderRadius: "var(--r2)",
            border: "1px solid var(--border)",
            fontSize: "13px",
            fontFamily: "monospace",
            color: "var(--text-2)"
          }}>
            {openaiKeyMasked}
          </div>
        ) : null}

        <label className="field">
          <span className="field__label">
            {openaiConfigured ? "キーを変更する（新しいキーを入力）" : "APIキーを入力"}
          </span>
          <input
            type="password"
            value={openaiKeyInput}
            onChange={(event) => setOpenaiKeyInput(event.target.value)}
            placeholder="sk-proj-..."
          />
        </label>

        <div className="btn-row">
          <button
            className="btn btn--fill btn--sm"
            disabled={openaiSaving}
            onClick={() => void saveOpenaiKey()}
            type="button"
          >
            {openaiSaving ? "保存中..." : "保存する"}
          </button>
          {openaiConfigured ? (
            <button
              className="btn btn--del btn--sm"
              disabled={openaiSaving}
              onClick={() => {
                setOpenaiKeyInput("");
                void (async () => {
                  if (!token) return;
                  setOpenaiSaving(true);
                  try {
                    await apiRequest("/api/admin/config", { method: "PUT", token, body: { openaiApiKey: "" } });
                    setOpenaiMsg("APIキーを削除しました。");
                    await load();
                  } finally { setOpenaiSaving(false); }
                })();
              }}
              type="button"
            >
              キーを削除
            </button>
          ) : null}
        </div>

        {openaiMsg ? <Feedback kind="ok">{openaiMsg}</Feedback> : null}
        {openaiErr ? <Feedback kind="err">{openaiErr}</Feedback> : null}
      </div>

      {/* ── User list + System info ───────────────────── */}
      <div className="two-up">
        <div className="card">
          <p className="eyebrow" style={{ marginBottom: "var(--s3)" }}>ユーザー状態</p>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {users.map((item) => (
              <div className="mini-row" key={item.id}>
                <div className="mini-row__body">
                  <strong>{item.name}</strong>
                  <p>{item.email}</p>
                  <p>
                    {item.role} ·{" "}
                    <span style={{ color: item.status === "ACTIVE" ? "var(--jade)" : "var(--coral)" }}>
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
        </div>

        <div className="card">
          <p className="eyebrow" style={{ marginBottom: "var(--s3)" }}>システム状態</p>
          <div style={{ display: "flex", flexDirection: "column" }}>
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
                <span style={{ fontSize: "13px", fontVariantNumeric: "tabular-nums", color: label === "Database" && value === "ready" ? "var(--jade)" : "var(--text-2)" }}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
