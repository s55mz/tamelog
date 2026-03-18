import { useMemo, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";

import { AppMetaFooter } from "./AppMetaFooter";
import { getInitials } from "../lib/format";
import type { AppUser } from "../lib/types";

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
  shortLabel?: string;
};

const primaryNav: NavItem[] = [
  { to: "/", label: "ホーム", icon: "home", shortLabel: "ホーム" },
  { to: "/record", label: "記録", icon: "edit_square", shortLabel: "記録" },
  { to: "/goals", label: "目標", icon: "flag", shortLabel: "目標" },
  { to: "/ledger", label: "家計簿", icon: "receipt_long", shortLabel: "家計簿" },
  { to: "/progress", label: "進捗", icon: "monitoring", shortLabel: "進捗" },
  { to: "/accounts", label: "口座", icon: "account_balance_wallet", shortLabel: "口座" },
  { to: "/impulse", label: "保留リスト", icon: "hourglass_top", shortLabel: "保留" },
  { to: "/chat", label: "AI相談", icon: "chat_bubble", shortLabel: "AI" },
  { to: "/settings", label: "設定", icon: "tune", shortLabel: "設定" }
];

const adminNav: NavItem[] = [
  { to: "/invite", label: "招待管理", icon: "mail", shortLabel: "招待" },
  { to: "/admin", label: "管理", icon: "admin_panel_settings", shortLabel: "管理" }
];

const mobileNav: NavItem[] = [
  { to: "/", label: "ホーム", icon: "home", shortLabel: "ホーム" },
  { to: "/ledger", label: "家計簿", icon: "receipt_long", shortLabel: "家計簿" },
  { to: "/record", label: "記録", icon: "add_circle", shortLabel: "記録" },
  { to: "/goals", label: "ためる", icon: "flag", shortLabel: "ためる" }
];

const furikaeriNav: NavItem[] = [
  { to: "/progress", label: "進捗", icon: "monitoring", shortLabel: "進捗" },
  { to: "/chat", label: "AI相談", icon: "chat_bubble", shortLabel: "AI" },
  { to: "/impulse", label: "保留リスト", icon: "hourglass_top", shortLabel: "保留" }
];

const accountNav: NavItem[] = [
  { to: "/accounts", label: "口座", icon: "account_balance_wallet", shortLabel: "口座" },
  { to: "/settings", label: "設定", icon: "tune", shortLabel: "設定" }
];

function NavGroup({
  heading,
  items,
  onNavigate
}: {
  heading: string;
  items: NavItem[];
  onNavigate?: () => void;
}) {
  return (
    <div className="layout-nav-group">
      <p className="layout-nav-heading">{heading}</p>
      <div className="layout-nav-items">
        {items.map((item) => (
          <NavLink className="layout-nav-link" key={item.to} onClick={onNavigate} to={item.to}>
            <span className="material-symbols-outlined">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  );
}

export function AppLayout({ title, subtitle, user, onLogout, children }: AppLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = user.role === "ADMIN";
  const paydayLabel = useMemo(() => `毎月${user.paydayOfMonth}日締め`, [user.paydayOfMonth]);
  const isRootPage = location.pathname === "/";
  const activeNavLabel = useMemo(() => {
    const allItems = [...primaryNav, ...adminNav];
    return allItems.find((item) => item.to === location.pathname)?.label ?? title;
  }, [location.pathname, title]);
  return (
    <div className="layout-shell">
      <aside className="layout-sidebar">
        <Link className="layout-brand" to="/">
          <div className="layout-brand-mark">
            <span className="material-symbols-outlined">savings</span>
          </div>
          <div>
            <p className="layout-brand-kicker">TameLog</p>
            <p className="layout-brand-name">貯めログ</p>
          </div>
        </Link>

        <div className="layout-sidebar-cta">
          <Link className="btn btn--fill btn--block" to="/record">
            <span className="material-symbols-outlined">add_circle</span>
            今日の記録を追加
          </Link>
          <div className="layout-sidebar-meta">
            <span className="layout-surface-pill">{isAdmin ? "管理者" : "ユーザー"}</span>
            <span className="layout-surface-pill">{paydayLabel}</span>
          </div>
        </div>

        <nav className="layout-sidebar-nav">
          <NavGroup heading="メイン" items={primaryNav.slice(0, 4)} />
          <NavGroup heading="管理する" items={primaryNav.slice(4)} />
          {isAdmin ? <NavGroup heading="管理者" items={adminNav} /> : null}
        </nav>

        <div className="layout-user-card">
          <div className="layout-user-avatar">{getInitials(user.name)}</div>
          <div className="layout-user-copy">
            <p className="layout-user-name">{user.name}</p>
            <p className="layout-user-meta">{user.email}</p>
          </div>
          {onLogout ? (
            <button className="btn btn--ghost btn--sm" onClick={() => void onLogout()} type="button">
              ログアウト
            </button>
          ) : null}
        </div>
      </aside>

      <div className="layout-main">
        <header className="layout-header">
          <div className="layout-header-mobilebar">
            <div className="layout-header-mobile-side">
              {isRootPage ? (
                <Link aria-label="ホームへ戻る" className="layout-app-icon" to="/">
                  <span className="material-symbols-outlined">savings</span>
                </Link>
              ) : (
                <button
                  aria-label="前の画面に戻る"
                  className="layout-app-icon"
                  onClick={() => navigate(-1)}
                  type="button"
                >
                  <span className="material-symbols-outlined">arrow_back_ios_new</span>
                </button>
              )}
            </div>

            <div className="layout-header-mobile-center">
              <p className="layout-header-mobile-title">{title}</p>
            </div>

            <div className="layout-header-mobile-side layout-header-mobile-side--end">
              <button
                aria-label="メニューを開く"
                className="layout-mobile-trigger"
                onClick={() => setMenuOpen(true)}
                type="button"
              >
                {getInitials(user.name)}
              </button>
            </div>
          </div>

          <div className="layout-header-desktop">
            <div>
              <p className="layout-header-kicker">{activeNavLabel}</p>
              <h1 className="layout-header-title">{title}</h1>
              {subtitle ? <p className="layout-header-subtitle">{subtitle}</p> : null}
            </div>
            <div className="layout-header-actions">
              <div className="layout-header-chip">
                <span className="material-symbols-outlined">calendar_month</span>
                <span>{paydayLabel}</span>
              </div>
              <Link className="btn btn--out btn--sm" to="/record">
                <span className="material-symbols-outlined">edit_square</span>
                記録
              </Link>
            </div>
          </div>
        </header>

        <main className="layout-content">{children}</main>
        <AppMetaFooter />
      </div>

      <nav className="layout-mobile-nav">
        {mobileNav.slice(0, 2).map((item) => (
          <NavLink className="layout-mobile-nav-link" key={item.to} to={item.to}>
            <span className="material-symbols-outlined">{item.icon}</span>
            <span>{item.shortLabel ?? item.label}</span>
          </NavLink>
        ))}
        <NavLink className="layout-mobile-nav-link layout-mobile-nav-link--primary" to="/record">
          <span className="material-symbols-outlined">add</span>
          <span>記録</span>
        </NavLink>
        {mobileNav.slice(3).map((item) => (
          <NavLink className="layout-mobile-nav-link" key={item.to} to={item.to}>
            <span className="material-symbols-outlined">{item.icon}</span>
            <span>{item.shortLabel ?? item.label}</span>
          </NavLink>
        ))}
        <button
          aria-label="その他のメニューを開く"
          className={`layout-mobile-nav-link${menuOpen ? " active" : ""}`}
          onClick={() => setMenuOpen(true)}
          type="button"
        >
          <span className="material-symbols-outlined">grid_view</span>
          <span>その他</span>
        </button>
      </nav>

      <div
        aria-hidden={menuOpen ? undefined : true}
        className={`layout-mobile-sheet${menuOpen ? " is-open" : ""}`}
        onClick={() => setMenuOpen(false)}
      >
        <div className="layout-mobile-sheet-panel" onClick={(event) => event.stopPropagation()}>
          <div className="layout-mobile-sheet-handle" />
          <div className="layout-mobile-sheet-header">
            <div>
              <p className="layout-nav-heading">メニュー</p>
              <p className="layout-mobile-sheet-title">{user.name}</p>
            </div>
            <button className="btn btn--ghost btn--sm" onClick={() => setMenuOpen(false)} type="button">
              閉じる
            </button>
          </div>

          <div className="layout-mobile-sheet-user">
            <div className="layout-user-avatar">{getInitials(user.name)}</div>
            <div className="layout-user-copy">
              <p className="layout-user-name">{user.name}</p>
              <p className="layout-user-meta">{user.email}</p>
            </div>
          </div>

          <NavGroup heading="ふり返る" items={furikaeriNav} onNavigate={() => setMenuOpen(false)} />
          <NavGroup heading="アカウント" items={accountNav} onNavigate={() => setMenuOpen(false)} />
          {isAdmin ? <NavGroup heading="管理者" items={adminNav} onNavigate={() => setMenuOpen(false)} /> : null}

          {onLogout ? (
            <button
              className="btn btn--out btn--block"
              onClick={() => {
                setMenuOpen(false);
                void onLogout();
              }}
              type="button"
            >
              ログアウト
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
