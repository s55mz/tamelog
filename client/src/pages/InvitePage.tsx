import { useEffect, useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { Feedback } from "../components/ui";
import { apiRequest } from "../lib/api";
import { formatDate } from "../lib/format";
import { getAuthToken } from "../lib/storage";
import type { AppUser } from "../lib/types";

type Invitation = { id: string; email: string; token: string; status: string; expiresAt: string };

type InvitePageProps = {
  user: AppUser;
  onLogout: () => Promise<void>;
};

export function InvitePage({ user, onLogout }: InvitePageProps) {
  const token = getAuthToken();
  const [email, setEmail] = useState("");
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [message, setMessage] = useState("");

  const loadInvitations = async () => {
    if (!token) return;
    const data = await apiRequest<{ invitations: Invitation[] }>("/api/admin/invitations", { token });
    setInvitations(data.invitations);
  };

  useEffect(() => { void loadInvitations(); }, [token]);

  const createInvitation = async () => {
    if (!token) return;
    const data = await apiRequest<{ registerUrl: string }>("/api/admin/invitations", {
      method: "POST", token, body: { email }
    });
    setMessage(`招待を作成しました: ${data.registerUrl}`);
    setEmail("");
    await loadInvitations();
  };

  const revokeInvitation = async (id: string) => {
    if (!token) return;
    await apiRequest(`/api/admin/invitations/${id}/revoke`, { method: "POST", token, body: {} });
    await loadInvitations();
  };

  return (
    <AppLayout
      onLogout={onLogout}
      subtitle="招待の発行と有効期限を管理します。"
      title="招待管理"
      user={user}
    >
      {/* ── Create form ────────────────────────────────── */}
      <div>
        <p className="eyebrow">招待を発行</p>
        <div className="card form-stack">
          <label className="field">
            <span className="field__label">メールアドレス</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" />
          </label>
          <button className="btn btn--fill" onClick={() => void createInvitation()} type="button">
            招待を作成
          </button>
          {message ? <Feedback kind="ok">{message}</Feedback> : null}
        </div>
      </div>

      {/* ── Invitation list ────────────────────────────── */}
      <div>
        <p className="eyebrow">招待一覧</p>
        {invitations.length ? (
          <div className="form-stack">
            {invitations.map((inv) => (
              <div className="card" key={inv.id}>
                <div className="row row--spread">
                  <div>
                    <p className="entry__title">{inv.email}</p>
                    <p className="entry__meta">期限 {formatDate(inv.expiresAt)}</p>
                  </div>
                  <span className={`badge ${inv.status === "ACTIVE" ? "badge--in" : inv.status === "EXPIRED" ? "badge--out" : ""}`}>
                    {inv.status}
                  </span>
                </div>
                <p className="text-mono text-xs" style={{ wordBreak: "break-all" }}>{inv.token}</p>
                {inv.status === "ACTIVE" ? (
                  <button className="btn btn--del btn--sm" onClick={() => void revokeInvitation(inv.id)} type="button">
                    失効させる
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">まだ招待はありません。</div>
        )}
      </div>
    </AppLayout>
  );
}
