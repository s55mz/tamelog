import { useState } from "react";
import { Link, NavLink } from "react-router-dom";

type AppUser = {
  name: string;
  email: string;
  role: string;
};

type NavItem = {
  to: string;
  label: string;
};

type AppLayoutProps = {
  title: string;
  subtitle?: string;
  user: AppUser;
  onLogout?: () => Promise<void>;
  children: React.ReactNode;
};

const primaryNav: NavItem[] = [
  { to: "/", label: "ホーム" },
  { to: "/goals", label: "目標" },
  { to: "/record", label: "記録" },
  { to: "/progress", label: "進捗" },
  { to: "/ledger", label: "家計簿" },
  { to: "/accounts", label: "口座" }
];

const secondaryNav: NavItem[] = [
  { to: "/impulse", label: "衝動買い" },
  { to: "/chat", label: "AI相談" }
];

const mobileMainNav: NavItem[] = [
  { to: "/", label: "ホーム" },
  { to: "/goals", label: "目標" },
  { to: "/record", label: "記録" }
];

export function AppLayout({ title, subtitle, user, onLogout, children }: AppLayoutProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const extraNav = [
    ...primaryNav.filter((item) => !mobileMainNav.some((mainItem) => mainItem.to === item.to)),
    ...secondaryNav,
    ...(user.role === "ADMIN"
      ? [
          { to: "/invite", label: "招待" },
          { to: "/admin", label: "管理者" }
        ]
      : [])
  ];

  return (
    <div className="app-layout">
      <aside className="desktop-sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">貯</div>
          <div>
            <p className="sidebar-overline">TameLog</p>
            <h1>貯めログ</h1>
          </div>
        </div>

        <nav className="sidebar-nav">
          {primaryNav.map((item) => (
            <NavLink className="sidebar-link" key={item.to} to={item.to}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-group">
          <p className="sidebar-overline">Tools</p>
          <nav className="sidebar-nav">
            {secondaryNav.map((item) => (
              <NavLink className="sidebar-link" key={item.to} to={item.to}>
                {item.label}
              </NavLink>
            ))}
            {user.role === "ADMIN" && (
              <>
                <NavLink className="sidebar-link" to="/invite">
                  招待
                </NavLink>
                <NavLink className="sidebar-link" to="/admin">
                  管理者
                </NavLink>
              </>
            )}
          </nav>
        </div>

        <div className="sidebar-footer">
          <div>
            <p className="sidebar-user">{user.name}</p>
            <p className="sidebar-email">{user.email}</p>
          </div>
          {onLogout && (
            <button className="ghost-button" onClick={() => void onLogout()} type="button">
              ログアウト
            </button>
          )}
        </div>
      </aside>

      <div className="app-main-shell">
        <header className="app-header">
          <div>
            <p className="page-kicker">Dashboard</p>
            <h1 className="page-title">{title}</h1>
            {subtitle && <p className="page-subtitle">{subtitle}</p>}
          </div>
          <div className="mobile-user-pill">
            <span>{user.name}</span>
          </div>
        </header>

        <main className="app-content">{children}</main>
      </div>

      <nav className="mobile-tabbar">
        {mobileMainNav.map((item) => (
          <NavLink className="mobile-tab" key={item.to} to={item.to}>
            {item.label}
          </NavLink>
        ))}
        <button className={`mobile-tab ${moreOpen ? "is-active" : ""}`} onClick={() => setMoreOpen((value) => !value)} type="button">
          その他
        </button>
      </nav>

      {moreOpen && (
        <div className="mobile-sheet">
          <div className="mobile-sheet-card">
            <div className="sheet-header">
              <strong>その他のメニュー</strong>
              <button className="ghost-button" onClick={() => setMoreOpen(false)} type="button">
                閉じる
              </button>
            </div>
            <div className="mobile-sheet-grid">
              {extraNav.map((item) => (
                <Link className="sheet-link" key={item.to} onClick={() => setMoreOpen(false)} to={item.to}>
                  {item.label}
                </Link>
              ))}
            </div>
            {onLogout && (
              <button className="ghost-button wide-button" onClick={() => void onLogout()} type="button">
                ログアウト
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
