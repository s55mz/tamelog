import { useEffect, useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { apiRequest } from "../lib/api";
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
    if (!token) {
      return;
    }

    const [usersData, systemData] = await Promise.all([
      apiRequest<{ users: AdminUser[] }>("/api/admin/users", { token }),
      apiRequest<{
        nodeVersion: string;
        platform: string;
        uptimeSec: number;
        dbReady: boolean;
      }>("/api/admin/system-info", { token })
    ]);

    setUsers(usersData.users);
    setSystemInfo(systemData);
  };

  useEffect(() => {
    void load();
  }, [token]);

  const toggleStatus = async (user: AdminUser) => {
    if (!token) {
      return;
    }

    await apiRequest(`/api/admin/users/${user.id}/suspend`, {
      method: "POST",
      token,
      body: {
        status: user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"
      }
    });

    await load();
  };

  return (
    <AppLayout onLogout={onLogout} subtitle="ユーザー状態とシステム状態を確認する管理者ビューです。" title="管理者" user={user}>
      <section className="content-section">
        <div className="section-heading-row"><div><p className="section-label">Users</p><h2 className="section-title">ユーザー</h2></div></div>
        <div className="goal-list">
          {users.map((user) => (
            <article className="goal-row-card" key={user.id}>
              <strong>{user.name}</strong>
              <p>{user.email}</p>
              <p>{user.role} / {user.status} / {user.setupCompleted ? "初期設定完了" : "初期設定未完了"}</p>
              {user.role !== "ADMIN" && (
                <button className="button button-secondary" onClick={() => toggleStatus(user)} type="button">
                  {user.status === "ACTIVE" ? "停止" : "再開"}
                </button>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="content-section">
        <article className="surface-card form-card">
          <p className="section-label">System</p>
          <h2 className="section-title">システム</h2>
          <div className="stack compact">
            <p>Node.js: {systemInfo?.nodeVersion ?? "-"}</p>
            <p>Platform: {systemInfo?.platform ?? "-"}</p>
            <p>Uptime: {systemInfo?.uptimeSec ?? 0} sec</p>
            <p>DB: {systemInfo?.dbReady ? "ready" : "not ready"}</p>
          </div>
        </article>
      </section>
    </AppLayout>
  );
}
