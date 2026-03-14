import { useMemo, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";

import type { AppUser } from "../lib/types";
import { getInitials } from "../lib/format";

type AppLayoutProps = {
  title: string;
  subtitle?: string;
  user: AppUser;
  onLogout?: () => Promise<void>;
  children: ReactNode;
};

type NavItem = {
  to: string;
  label: string;
  icon: string;
};

/* Primary navigation (sidebar + mobile sheet) */
const mainNav: NavItem[] = [
  { to: "/", label: "ホーム", icon: "home" },
  { to: "/record", label: "記録", icon: "add_circle" },
  { to: "/accounts", label: "口座", icon: "account_balance_wallet" },
  { to: "/goals", label: "目標", icon: "flag" },
  { to: "/ledger", label: "家計簿", icon: "receipt_long" },
  { to: "/progress", label: "進捗", icon: "bar_chart" },
  { to: "/impulse", label: "保留リスト", icon: "hourglass_top" },
  { to: "/chat", label: "AI相談", icon: "chat" }
];

/* Mobile bottom tab (5 items only) */
const tabNav: NavItem[] = [
  { to: "/", label: "ホーム", icon: "home" },
  { to: "/record", label: "記録", icon: "add_circle" },
  { to: "/ledger", label: "家計簿", icon: "receipt_long" },
  { to: "/goals", label: "目標", icon: "flag" }
];

export function AppLayout({ title, user, onLogout, children }: AppLayoutProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const adminNav = useMemo<NavItem[]>(
    () =>
      user.role === "ADMIN"
        ? [
            { to: "/invite", label: "招待管理", icon: "mail" },
            { to: "/admin", label: "管理", icon: "admin_panel_settings" }
          ]
        : [],
    [user.role]
  );

  const allSheetNav = useMemo(
    () => [
      ...mainNav.filter((item) => !["/", "/record", "/accounts", "/goals"].includes(item.to)),
      { to: "/settings", label: "設定", icon: "settings" },
      ...adminNav
    ],
    [adminNav]
  );

  return (
    <div className="shell">
      {/* ── PC Sidebar ────────────────────────────────── */}
      <aside className="sidebar">
        <Link className="sidebar__brand" to="/">
          <div className="sidebar__brand-mark">
            <span className="material-symbols-outlined">savings</span>
          </div>
          <span className="sidebar__brand-name">貯めログ</span>
        </Link>

        <nav className="sidebar__nav">
          {mainNav.map((item) => (
            <NavLink className="nav-link" key={item.to} to={item.to}>
              <span className="material-symbols-outlined">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}

          {adminNav.length > 0 ? (
            <>
              <div className="sidebar__divider" />
              {adminNav.map((item) => (
                <NavLink className="nav-link" key={item.to} to={item.to}>
                  <span className="material-symbols-outlined">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </>
          ) : null}
        </nav>

        <div className="sidebar__divider" />

        <div className="sidebar__footer">
          <NavLink className="nav-link" to="/settings">
            <span className="material-symbols-outlined">settings</span>
            <span>設定</span>
          </NavLink>

          <div className="sidebar__user">
            <div className="sidebar__avatar">{getInitials(user.name)}</div>
            <div className="sidebar__user-info">
              <div className="sidebar__user-name">{user.name}</div>
              <div className="sidebar__user-email">{user.email}</div>
            </div>
          </div>

          {onLogout ? (
            <button className="btn btn--ghost" onClick={() => void onLogout()} style={{ justifyContent: "flex-start", minHeight: "36px", paddingLeft: "0", fontSize: "13px" }} type="button">
              ログアウト
            </button>
          ) : null}
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────── */}
      <div className="page-area">
        {/* Mobile topbar */}
        <header className="topbar">
          <div className="topbar__brand">
            <div className="topbar__brand-mark">
              <span className="material-symbols-outlined">savings</span>
            </div>
            <div className="topbar__brand-copy">
              <span className="topbar__eyebrow">貯めログ</span>
              <span className="topbar__title">{title}</span>
            </div>
          </div>
          <div className="topbar__actions">
            <button
              className="topbar__profile"
              onClick={() => setSheetOpen(true)}
              type="button"
              aria-label="メニューを開く"
            >
              {getInitials(user.name)}
            </button>
          </div>
        </header>

        <main className="page-body">
          <section className="mobile-page-head" aria-hidden="true">
            <p className="mobile-page-head__eyebrow">Finance Snapshot</p>
            <h1 className="mobile-page-head__title">{title}</h1>
          </section>
          {children}
        </main>
      </div>

      {/* ── Mobile Bottom Tabbar ───────────────────────── */}
      <nav className="tabbar">
        {tabNav.map((item) => (
          <NavLink className="tabbar__item" key={item.to} to={item.to}>
            <span className="material-symbols-outlined">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button
          className={`tabbar__item ${sheetOpen ? "active" : ""}`}
          onClick={() => setSheetOpen(true)}
          type="button"
          aria-label="メニューを開く"
        >
          <span className="material-symbols-outlined">grid_view</span>
          <span>メニュー</span>
        </button>
      </nav>

      {/* ── Mobile Menu Sheet ─────────────────────────── */}
      {sheetOpen ? (
        <div className="sheet-overlay open" onClick={() => setSheetOpen(false)}>
          <div className="sheet-panel" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-panel__grab" />
            <div className="sheet-panel__header">
              <div>
                <p className="eyebrow">メニュー</p>
                <strong style={{ fontSize: "15px" }}>{user.name}</strong>
              </div>
              <button className="btn btn--icon btn--sm" onClick={() => setSheetOpen(false)} type="button">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="sheet-grid">
              {allSheetNav.map((item) => (
                <NavLink
                  className="sheet-link"
                  key={item.to}
                  onClick={() => setSheetOpen(false)}
                  to={item.to}
                >
                  <span className="material-symbols-outlined">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>

            {onLogout ? (
              <button
                className="btn btn--out"
                onClick={() => {
                  setSheetOpen(false);
                  void onLogout();
                }}
                type="button"
                style={{ width: "100%" }}
              >
                ログアウト
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
