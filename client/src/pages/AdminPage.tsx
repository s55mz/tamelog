import { useEffect, useState } from "react";

import { AppLayout } from "../components/AppLayout";
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

  const load = async () => {
    if (!token) return;
    const [usersData, systemData] = await Promise.all([
      apiRequest<{ users: AdminUser[] }>("/api/admin/users", { token }),
      apiRequest<{ nodeVersion: string; platform: string; uptimeSec: number; dbReady: boolean }>("/api/admin/system-info", { token })
    ]);
    setUsers(usersData.users);
    setSystemInfo(systemData);
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

      {/* ── User list ──────────────────────────────────── */}
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

        {/* ── System info ────────────────────────────────── */}
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
