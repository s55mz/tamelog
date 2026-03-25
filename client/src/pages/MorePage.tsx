import { NavLink } from "react-router-dom";

import { AppLayout } from "../components/AppLayout";
import { getInitials } from "../lib/format";
import type { AppUser } from "../lib/types";

type MorePageProps = {
  user: AppUser;
  onLogout: () => Promise<void>;
};

type NavItem = { to: string; label: string; icon: string };

const furikaeriNav: NavItem[] = [
  { to: "/inbox",    label: "候補インボックス", icon: "inbox" },
  { to: "/progress", label: "進捗",             icon: "monitoring" },
  { to: "/impulse",  label: "保留リスト",       icon: "hourglass_top" }
];

const toolNav: NavItem[] = [
  { to: "/mailbox", label: "受信メール", icon: "mark_email_unread" },
  { to: "/chat",    label: "AI相談",     icon: "chat_bubble" }
];

const accountNav: NavItem[] = [
  { to: "/accounts", label: "口座", icon: "account_balance_wallet" },
  { to: "/settings", label: "設定", icon: "tune" }
];

const adminNav: NavItem[] = [
  { to: "/invite", label: "招待管理", icon: "mail" },
  { to: "/admin",  label: "管理",     icon: "admin_panel_settings" }
];

function MenuGroup({ heading, items }: { heading: string; items: NavItem[] }) {
  return (
    <div className="more-group">
      <p className="eyebrow eyebrow--mb">{heading}</p>
      <div className="card card--flush">
        {items.map((item) => (
          <NavLink className="more-row" key={item.to} to={item.to}>
            <span className="more-row__icon material-symbols-outlined">{item.icon}</span>
            <span className="more-row__label">{item.label}</span>
            <span className="more-row__chevron material-symbols-outlined">chevron_right</span>
          </NavLink>
        ))}
      </div>
    </div>
  );
}

export function MorePage({ user, onLogout }: MorePageProps) {
  const isAdmin = user.role === "ADMIN";

  return (
    <AppLayout onLogout={onLogout} title="メニュー" user={user}>
      <div className="more-page">
        <div className="card card--row">
          <div className="layout-user-avatar">{getInitials(user.name)}</div>
          <div className="layout-user-copy">
            <p className="layout-user-name">{user.name}</p>
            <p className="layout-user-meta">{user.email}</p>
          </div>
        </div>

        <MenuGroup heading="ふり返る" items={furikaeriNav} />
        <MenuGroup heading="ツール"   items={toolNav} />
        <MenuGroup heading="アカウント" items={accountNav} />
        {isAdmin ? <MenuGroup heading="管理者" items={adminNav} /> : null}

        <button
          className="btn btn--out btn--block"
          onClick={() => void onLogout()}
          type="button"
        >
          ログアウト
        </button>
      </div>
    </AppLayout>
  );
}
