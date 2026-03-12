import { useEffect, useState } from "react";

import { apiRequest } from "../lib/api";
import { getAuthToken } from "../lib/storage";

type Invitation = {
  id: string;
  email: string;
  token: string;
  status: string;
  expiresAt: string;
};

export function InvitePage() {
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
    <main className="screen-shell">
      <section className="panel panel-wide">
        <span className="eyebrow">Invite</span>
        <h1>招待管理</h1>
        <div className="stack">
          <label className="field">
            <span>招待するメールアドレス</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <button className="button" onClick={createInvitation} type="button">
            招待を作成
          </button>
          {message && <p className="success-text">{message}</p>}
        </div>

        <div className="stack">
          <h2 className="section-subtitle">招待一覧</h2>
          {invitations.map((invitation) => (
            <article className="subpanel" key={invitation.id}>
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
    </main>
  );
}
