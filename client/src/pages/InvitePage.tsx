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

const statusColor: Record<string, string> = {
  ACTIVE: "var(--jade)",
  USED: "var(--text-3)",
  EXPIRED: "var(--coral)",
  REVOKED: "var(--text-3)"
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
      method: "POST",
      token,
      body: { email }
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
    <AppLayout onLogout={onLogout} title="招待管理" user={user}>
      {/* ── Create form ────────────────────────────────── */}
      <div>
        <p className="eyebrow" style={{ marginBottom: "var(--s3)" }}>招待を発行</p>
        <div className="card form-stack">
          <label className="field">
            <span className="field__label">メールアドレス</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="user@example.com" />
          </label>
          <button className="btn btn--fill" onClick={() => void createInvitation()} type="button">
            招待を作成
          </button>
          {message ? <Feedback kind="ok">{message}</Feedback> : null}
        </div>
      </div>

      {/* ── Invitation list ────────────────────────────── */}
      <div>
        <p className="eyebrow" style={{ marginBottom: "var(--s3)" }}>招待一覧</p>
        {invitations.length ? (
          <div className="entry-list">
            {invitations.map((invitation) => (
              <div className="card" key={invitation.id} style={{ padding: "var(--s4)" }}>
                <div className="row row--spread" style={{ marginBottom: "var(--s2)" }}>
                  <div>
                    <p style={{ fontSize: "14px", fontWeight: 600 }}>{invitation.email}</p>
                    <p style={{ fontSize: "12px", color: "var(--text-2)", marginTop: "2px" }}>
                      期限 {formatDate(invitation.expiresAt)}
                    </p>
                  </div>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: statusColor[invitation.status] ?? "var(--text-2)" }}>
                    {invitation.status}
                  </span>
                </div>
                <p style={{ fontSize: "11px", color: "var(--text-3)", fontFamily: "ui-monospace, monospace", wordBreak: "break-all", marginBottom: "var(--s3)" }}>
                  {invitation.token}
                </p>
                {invitation.status === "ACTIVE" ? (
                  <button className="btn btn--del btn--sm" onClick={() => void revokeInvitation(invitation.id)} type="button">
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
