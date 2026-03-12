import { useMemo, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

import type { AppUser } from "../lib/types";

type NavItem = {
  to: string;
  label: string;
  icon: string;
};

type AppLayoutProps = {
  title: string;
  subtitle?: string;
  user: AppUser;
  onLogout?: () => Promise<void>;
  children: React.ReactNode;
};

const primaryNav: NavItem[] = [
  { to: "/", label: "ホーム", icon: "home" },
  { to: "/record", label: "記録", icon: "edit_note" },
  { to: "/goals", label: "目標", icon: "track_changes" },
  { to: "/progress", label: "進捗", icon: "query_stats" },
  { to: "/ledger", label: "家計簿", icon: "menu_book" },
  { to: "/accounts", label: "口座管理", icon: "account_balance_wallet" },
  { to: "/impulse", label: "衝動買いチェック", icon: "shoppingmode" },
  { to: "/chat", label: "AIチャット", icon: "smart_toy" },
  { to: "/settings", label: "設定", icon: "settings" }
];

const secondaryNav: NavItem[] = [];

const mobileMainNav: NavItem[] = [
  { to: "/", label: "ホーム", icon: "home" },
  { to: "/record", label: "記録", icon: "edit_note" },
  { to: "/ledger", label: "家計簿", icon: "menu_book" }
];

function formatToday() {
  const now = new Date();
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return `${now.getMonth() + 1}月${now.getDate()}日 ${weekdays[now.getDay()]}曜日`;
}

export function AppLayout({ title, subtitle, user, onLogout, children }: AppLayoutProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();

  const extraNav = useMemo(
    () => [
      ...primaryNav.filter((item) => !mobileMainNav.some((mainItem) => mainItem.to === item.to)),
      ...secondaryNav,
      ...(user.role === "ADMIN"
        ? [
            { to: "/invite", label: "招待", icon: "mail" },
            { to: "/admin", label: "管理者", icon: "settings" }
          ]
        : [])
    ],
    [user.role]
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <div className="sidebar__mark">
            <span className="material-symbols-outlined">savings</span>
          </div>
          <div>
            <p className="sidebar__eyebrow">Slow Finance</p>
            <h1 className="sidebar__title">貯めログ</h1>
            <p className="sidebar__caption">無理なく続けるための貯金ダッシュボード</p>
          </div>
        </div>

        <div className="sidebar__section">
          <p className="sidebar__sectionTitle">Main</p>
          <nav className="sidebar__nav">
            {primaryNav.map((item) => (
              <NavLink className="sidebar__link" key={item.to} to={item.to}>
                <span className="material-symbols-outlined">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="sidebar__section">
          <p className="sidebar__sectionTitle">More</p>
          <nav className="sidebar__nav">
            {secondaryNav.map((item) => (
              <NavLink className="sidebar__link" key={item.to} to={item.to}>
                <span className="material-symbols-outlined">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
            {user.role === "ADMIN" && (
              <>
                <NavLink className="sidebar__link" to="/invite">
                  <span className="material-symbols-outlined">mail</span>
                  <span>招待</span>
                </NavLink>
                <NavLink className="sidebar__link" to="/admin">
                  <span className="material-symbols-outlined">settings</span>
                  <span>管理者</span>
                </NavLink>
              </>
            )}
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
              <p className="pageKicker">Slow Finance</p>
              <h1 className="mobileHeader__title">{title}</h1>
            </div>
          </div>
          <button className="iconButton" onClick={() => setMoreOpen((value) => !value)} type="button">
            <span className="material-symbols-outlined">apps</span>
          </button>
        </header>

        <header className="pageHeader">
          <div>
            <p className="pageKicker">Personal Saving System</p>
            <h1 className="pageTitle">{title}</h1>
            {subtitle && <p className="pageSubtitle">{subtitle}</p>}
          </div>
          <div className="pageHeader__meta">
            <div className="metaChip">
              <span className="material-symbols-outlined">calendar_today</span>
              <span>{formatToday()}</span>
            </div>
            <div className="metaChip">
              <span className="material-symbols-outlined">payments</span>
              <span>給料日 {user.paydayOfMonth}日</span>
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
        <button className={`tabbar__item ${moreOpen ? "is-active" : ""}`} onClick={() => setMoreOpen((value) => !value)} type="button">
          <span className="material-symbols-outlined">more_horiz</span>
          <span>その他</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="sheet" onClick={() => setMoreOpen(false)}>
          <div className="sheet__card" onClick={(event) => event.stopPropagation()}>
            <div className="sheet__header">
              <div>
                <p className="sectionLabel">More</p>
                <strong>その他のメニュー</strong>
              </div>
              <button className="iconButton" onClick={() => setMoreOpen(false)} type="button">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="sheet__grid">
              {extraNav.map((item) => (
                <Link className={`sheet__link ${location.pathname === item.to ? "is-active" : ""}`} key={item.to} onClick={() => setMoreOpen(false)} to={item.to}>
                  <span className="material-symbols-outlined">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
            {onLogout && (
              <button className="ghostButton wideButton" onClick={() => void onLogout()} type="button">
                <span className="material-symbols-outlined">logout</span>
                <span>ログアウト</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
