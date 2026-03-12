import { useEffect, useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { apiRequest } from "../lib/api";
import { getAuthToken } from "../lib/storage";
import type { AppUser } from "../lib/types";

type Invitation = {
  id: string;
  email: string;
  token: string;
  status: string;
  expiresAt: string;
};

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
    if (!token) {
      return;
    }

    const data = await apiRequest<{ invitations: Invitation[] }>("/api/admin/invitations", { token });
    setInvitations(data.invitations);
  };

  useEffect(() => {
    void loadInvitations();
  }, [token]);

  const createInvitation = async () => {
    if (!token) {
      return;
    }

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
    if (!token) {
      return;
    }

    await apiRequest(`/api/admin/invitations/${id}/revoke`, {
      method: "POST",
      token,
      body: {}
    });
    await loadInvitations();
  };

  return (
    <AppLayout onLogout={onLogout} subtitle="招待リンクの作成と状態管理を行う管理者画面です。" title="招待管理" user={user}>
      <section className="content-section">
        <article className="surface-card form-card">
          <p className="section-label">New Invite</p>
          <div className="stack compact">
          <label className="field">
            <span>招待するメールアドレス</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <button className="button" onClick={createInvitation} type="button">
            招待を作成
          </button>
          {message && <p className="success-text">{message}</p>}
          </div>
        </article>
      </section>

      <section className="content-section">
        <div className="section-heading-row"><div><p className="section-label">Invitations</p><h2 className="section-title">招待一覧</h2></div></div>
        <div className="goal-list">
          {invitations.map((invitation) => (
            <article className="goal-row-card" key={invitation.id}>
              <strong>{invitation.email}</strong>
              <p>{invitation.status} / {invitation.expiresAt.slice(0, 10)}</p>
              <p>{invitation.token}</p>
              {invitation.status === "ACTIVE" && (
                <button className="button button-secondary" onClick={() => revokeInvitation(invitation.id)} type="button">
                  手動失効
                </button>
              )}
            </article>
          ))}
        </div>
      </section>
    </AppLayout>
  );
}
