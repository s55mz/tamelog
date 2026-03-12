import { useEffect, useState } from "react";

import { apiRequest } from "../lib/api";
import { getAuthToken } from "../lib/storage";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  setupCompleted: boolean;
  createdAt: string;
};

export function AdminPage() {
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
    <main className="screen-shell">
      <section className="panel panel-wide">
        <span className="eyebrow">Admin</span>
        <h1>管理者</h1>

        <div className="stack">
          <h2 className="section-subtitle">ユーザー</h2>
          {users.map((user) => (
            <article className="subpanel" key={user.id}>
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

        <div className="stack">
          <h2 className="section-subtitle">システム</h2>
          <article className="subpanel">
            <p>Node.js: {systemInfo?.nodeVersion ?? "-"}</p>
            <p>Platform: {systemInfo?.platform ?? "-"}</p>
            <p>Uptime: {systemInfo?.uptimeSec ?? 0} sec</p>
            <p>DB: {systemInfo?.dbReady ? "ready" : "not ready"}</p>
          </article>
        </div>
      </section>
    </main>
  );
}
