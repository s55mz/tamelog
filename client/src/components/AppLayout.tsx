import { useMemo, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

import type { AppUser } from "../lib/types";

type NavItem = {
  to: string;
  label: string;
  icon: string;
  shortLabel?: string;
};

type AppLayoutProps = {
  title: string;
  subtitle?: string;
  user: AppUser;
  onLogout?: () => Promise<void>;
  children: React.ReactNode;
};

const primaryNav: NavItem[] = [
  { to: "/", label: "ホーム", icon: "home", shortLabel: "Home" },
  { to: "/record", label: "記録", icon: "edit_square", shortLabel: "Record" },
  { to: "/goals", label: "目標", icon: "flag", shortLabel: "Goals" },
  { to: "/progress", label: "進捗", icon: "monitoring", shortLabel: "Progress" },
  { to: "/ledger", label: "家計簿", icon: "table_chart", shortLabel: "Ledger" },
  { to: "/accounts", label: "口座", icon: "wallet", shortLabel: "Accounts" }
];

const utilityNav: NavItem[] = [
  { to: "/impulse", label: "衝動買い", icon: "schedule" },
  { to: "/chat", label: "AI相談", icon: "forum" },
  { to: "/settings", label: "設定", icon: "settings" }
];

const mobileMainNav: NavItem[] = [
  { to: "/", label: "ホーム", icon: "home" },
  { to: "/goals", label: "目標", icon: "flag" },
  { to: "/record", label: "記録", icon: "add_circle" }
];

const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];

function formatToday() {
  const now = new Date();
  return `${now.getMonth() + 1}月${now.getDate()}日 ${weekdayLabels[now.getDay()]}曜日`;
}

export function AppLayout({ title, subtitle, user, onLogout, children }: AppLayoutProps) {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const isAdmin = user.role === "ADMIN";

  const adminNav = useMemo<NavItem[]>(
    () => (isAdmin ? [{ to: "/invite", label: "招待", icon: "mail" }, { to: "/admin", label: "管理者", icon: "shield_person" }] : []),
    [isAdmin]
  );

  const moreNav = useMemo(
    () =>
      [
        ...primaryNav.filter((item) => !mobileMainNav.some((mobileItem) => mobileItem.to === item.to)),
        ...utilityNav,
        ...adminNav
      ],
    [adminNav]
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <Link className="sidebar__brandLink" to="/">
            <div className="sidebar__mark">
              <span className="material-symbols-outlined">savings</span>
            </div>
            <div>
              <p className="sidebar__eyebrow">Saving Ledger</p>
              <h1 className="sidebar__title">貯めログ</h1>
            </div>
          </Link>
          <p className="sidebar__caption">口座の変化と目標の前進を同じ視点で管理する家計アプリ。</p>
        </div>

        <div className="sidebar__section">
          <p className="sidebar__sectionTitle">Workspace</p>
          <nav className="sidebar__nav">
            {primaryNav.map((item) => (
              <NavLink className="sidebar__link" key={item.to} to={item.to}>
                <span className="material-symbols-outlined">{item.icon}</span>
                <span>{item.label}</span>
                {item.shortLabel && <small>{item.shortLabel}</small>}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="sidebar__section">
          <p className="sidebar__sectionTitle">Tools</p>
          <nav className="sidebar__nav">
            {utilityNav.map((item) => (
              <NavLink className="sidebar__link" key={item.to} to={item.to}>
                <span className="material-symbols-outlined">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
            {adminNav.map((item) => (
              <NavLink className="sidebar__link" key={item.to} to={item.to}>
                <span className="material-symbols-outlined">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="sidebar__footer">
          <div className="identityCard">
            <div className="identityCard__avatar">{user.name.slice(0, 1)}</div>
            <div>
              <p className="identityCard__name">{user.name}</p>
              <p className="identityCard__meta">{user.email}</p>
            </div>
          </div>
          <div className="sidebar__metaRow">
            <div className="metaChip">
              <span className="material-symbols-outlined">today</span>
              <span>{formatToday()}</span>
            </div>
            <div className="metaChip">
              <span className="material-symbols-outlined">payments</span>
              <span>給料日 {user.paydayOfMonth}日</span>
            </div>
          </div>
          {onLogout && (
            <button className="ghostButton wideButton" onClick={() => void onLogout()} type="button">
              <span className="material-symbols-outlined">logout</span>
              <span>ログアウト</span>
            </button>
          )}
        </div>
      </aside>

      <div className="mainShell">
        <header className="mobileHeader">
          <div className="mobileHeader__brand">
            <div className="mobileHeader__mark">
              <span className="material-symbols-outlined">savings</span>
            </div>
            <div>
              <p className="pageKicker">Saving Ledger</p>
              <h1 className="mobileHeader__title">{title}</h1>
            </div>
          </div>
          <button className="iconButton" onClick={() => setMoreOpen((open) => !open)} type="button">
            <span className="material-symbols-outlined">grid_view</span>
          </button>
        </header>

        <header className="pageHeader">
          <div>
            <p className="pageKicker">Personal Finance Workspace</p>
            <h1 className="pageTitle">{title}</h1>
            {subtitle ? <p className="pageSubtitle">{subtitle}</p> : null}
          </div>
          <div className="pageHeader__meta">
            <div className="metaChip">
              <span className="material-symbols-outlined">calendar_month</span>
              <span>{formatToday()}</span>
            </div>
            <div className="metaChip">
              <span className="material-symbols-outlined">person</span>
              <span>{user.role === "ADMIN" ? "管理者" : "ユーザー"}</span>
            </div>
          </div>
        </header>

        <main className="pageContent">{children}</main>
      </div>

      <nav className="tabbar">
        {mobileMainNav.map((item) => (
          <NavLink className="tabbar__item" key={item.to} to={item.to}>
            <span className="material-symbols-outlined">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button className={`tabbar__item ${moreOpen ? "is-active" : ""}`} onClick={() => setMoreOpen((open) => !open)} type="button">
          <span className="material-symbols-outlined">apps</span>
          <span>その他</span>
        </button>
      </nav>

      {moreOpen ? (
        <div className="sheet" onClick={() => setMoreOpen(false)}>
          <div className="sheet__card" onClick={(event) => event.stopPropagation()}>
            <div className="sheet__header">
              <div>
                <p className="sectionLabel">More</p>
                <strong>メニュー</strong>
              </div>
              <button className="iconButton" onClick={() => setMoreOpen(false)} type="button">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="sheet__grid">
              {moreNav.map((item) => (
                <Link
                  className={`sheet__link ${location.pathname === item.to ? "is-active" : ""}`}
                  key={item.to}
                  onClick={() => setMoreOpen(false)}
                  to={item.to}
                >
                  <span className="material-symbols-outlined">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
            {onLogout ? (
              <button className="ghostButton wideButton" onClick={() => void onLogout()} type="button">
                <span className="material-symbols-outlined">logout</span>
                <span>ログアウト</span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
