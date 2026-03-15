import { useMemo, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

import type { AppUser } from "../lib/types";
import { getInitials } from "../lib/format";

type AppLayoutProps = {
  title: string;
  subtitle?: string;
  user: AppUser;
  onLogout?: () => Promise<void>;
  children: ReactNode;
};

export function AppLayout({ title, user, onLogout, children }: AppLayoutProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const location = useLocation();

  const isAdmin = user.role === "ADMIN";

  // Which "section" is currently active (for top-level highlight in PC nav)
  const activePath = location.pathname;
  const inSave = ["/goals", "/impulse"].some((p) => activePath === p || activePath.startsWith(p + "/"));
  const inReview = ["/ledger", "/progress", "/chat"].some((p) => activePath === p || activePath.startsWith(p + "/"));

  // Sheet nav items
  const sheetItems = useMemo(() => {
    const base = [
      { to: "/ledger",   label: "家計簿",    icon: "receipt_long" },
      { to: "/progress", label: "進捗",       icon: "bar_chart" },
      { to: "/chat",     label: "AI相談",     icon: "chat" },
      { to: "/accounts", label: "口座",       icon: "account_balance_wallet" },
      { to: "/impulse",  label: "保留リスト", icon: "hourglass_top" },
      { to: "/settings", label: "設定",       icon: "settings" }
    ];
    if (isAdmin) {
      base.push(
        { to: "/invite", label: "招待管理", icon: "mail" },
        { to: "/admin",  label: "管理",     icon: "admin_panel_settings" }
      );
    }
    return base;
  }, [isAdmin]);

  return (
    <div className="shell">
      {/* ── PC Sidebar ────────────────────────────────── */}
      <aside className="sidebar">
        {/* Brand */}
        <Link className="sidebar__brand" to="/">
          <div className="sidebar__brand-mark">
            <span className="material-symbols-outlined">savings</span>
          </div>
          <span className="sidebar__brand-name">貯めログ</span>
        </Link>

        {/* + 記録 CTA */}
        <Link className="sidebar__record-cta" to="/record">
          <span className="material-symbols-outlined">add_circle</span>
          記録する
        </Link>

        {/* Main nav */}
        <nav className="sidebar__nav">
          {/* ホーム */}
          <NavLink className="nav-link" to="/" end>
            <span className="material-symbols-outlined">home</span>
            <span>ホーム</span>
          </NavLink>

          {/* ためる セクション */}
          <div className={`nav-section${inSave ? " nav-section--active" : ""}`}>
            <NavLink className="nav-link" to="/goals">
              <span className="material-symbols-outlined">savings</span>
              <span>ためる</span>
            </NavLink>
            <NavLink className="nav-link nav-link--sub" to="/goals">
              目標管理
            </NavLink>
            <NavLink className="nav-link nav-link--sub" to="/impulse">
              保留リスト
            </NavLink>
          </div>

          {/* ふり返る セクション */}
          <div className={`nav-section${inReview ? " nav-section--active" : ""}`}>
            <NavLink className="nav-link" to="/ledger">
              <span className="material-symbols-outlined">analytics</span>
              <span>ふり返る</span>
            </NavLink>
            <NavLink className="nav-link nav-link--sub" to="/ledger">
              家計簿
            </NavLink>
            <NavLink className="nav-link nav-link--sub" to="/progress">
              進捗レポート
            </NavLink>
            <NavLink className="nav-link nav-link--sub" to="/chat">
              AI相談
            </NavLink>
          </div>
        </nav>

        <div className="sidebar__divider" />

        {/* Footer nav */}
        <div className="sidebar__footer">
          <NavLink className="nav-link" to="/accounts">
            <span className="material-symbols-outlined">account_balance_wallet</span>
            <span>口座管理</span>
          </NavLink>
          <NavLink className="nav-link" to="/settings">
            <span className="material-symbols-outlined">settings</span>
            <span>設定</span>
          </NavLink>

          {isAdmin ? (
            <>
              <NavLink className="nav-link" to="/invite">
                <span className="material-symbols-outlined">mail</span>
                <span>招待管理</span>
              </NavLink>
              <NavLink className="nav-link" to="/admin">
                <span className="material-symbols-outlined">admin_panel_settings</span>
                <span>管理</span>
              </NavLink>
            </>
          ) : null}

          <div className="sidebar__user">
            <div className="sidebar__avatar">{getInitials(user.name)}</div>
            <div className="sidebar__user-info">
              <div className="sidebar__user-name">{user.name}</div>
              <div className="sidebar__user-email">{user.email}</div>
            </div>
          </div>

          {onLogout ? (
            <button
              className="btn btn--ghost"
              onClick={() => void onLogout()}
              style={{ justifyContent: "flex-start", minHeight: "36px", paddingLeft: "0", fontSize: "13px" }}
              type="button"
            >
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
          {children}
        </main>
      </div>

      {/* ── Mobile Bottom Tabbar (4 tabs) ──────────────── */}
      <nav className="tabbar">
        {/* いま */}
        <NavLink className="tabbar__item" to="/" end>
          <span className="material-symbols-outlined">home</span>
          <span>いま</span>
        </NavLink>

        {/* 記録 — prominent center tab */}
        <NavLink className="tabbar__item tabbar__item--record" to="/record">
          <span className="material-symbols-outlined">add_circle</span>
          <span>記録</span>
        </NavLink>

        {/* ためる */}
        <NavLink className="tabbar__item" to="/goals">
          <span className="material-symbols-outlined">savings</span>
          <span>ためる</span>
        </NavLink>

        {/* その他 */}
        <button
          className={`tabbar__item${sheetOpen ? " active" : ""}`}
          onClick={() => setSheetOpen(true)}
          type="button"
          aria-label="メニューを開く"
        >
          <span className="material-symbols-outlined">grid_view</span>
          <span>その他</span>
        </button>
      </nav>

      {/* ── Mobile Menu Sheet — always rendered, animated ── */}
      <div
        className={`sheet-overlay${sheetOpen ? " open" : ""}`}
        onClick={() => setSheetOpen(false)}
        aria-hidden={sheetOpen ? undefined : true}
      >
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

            {/* Sheet sections */}
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--s1)" }}>
              {/* ふり返る group */}
              <p style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-3)", textTransform: "uppercase", padding: "var(--s2) var(--s1) var(--s1)" }}>
                ふり返る
              </p>
              {[
                { to: "/ledger",   label: "家計簿",    icon: "receipt_long" },
                { to: "/progress", label: "進捗",       icon: "bar_chart" },
                { to: "/chat",     label: "AI相談",     icon: "chat" }
              ].map((item) => (
                <NavLink
                  className="sheet-list-item"
                  key={item.to}
                  onClick={() => setSheetOpen(false)}
                  to={item.to}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}

              {/* アカウント group */}
              <p style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-3)", textTransform: "uppercase", padding: "var(--s3) var(--s1) var(--s1)" }}>
                アカウント
              </p>
              {[
                { to: "/accounts", label: "口座",       icon: "account_balance_wallet" },
                { to: "/impulse",  label: "保留リスト", icon: "hourglass_top" },
                { to: "/settings", label: "設定",       icon: "settings" }
              ].map((item) => (
                <NavLink
                  className="sheet-list-item"
                  key={item.to}
                  onClick={() => setSheetOpen(false)}
                  to={item.to}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}

              {/* Admin group */}
              {isAdmin ? (
                <>
                  <p style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-3)", textTransform: "uppercase", padding: "var(--s3) var(--s1) var(--s1)" }}>
                    管理者
                  </p>
                  {[
                    { to: "/invite", label: "招待管理", icon: "mail" },
                    { to: "/admin",  label: "管理",     icon: "admin_panel_settings" }
                  ].map((item) => (
                    <NavLink
                      className="sheet-list-item"
                      key={item.to}
                      onClick={() => setSheetOpen(false)}
                      to={item.to}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>{item.icon}</span>
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </>
              ) : null}
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
      </div>
  );
}
