import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Home, Inbox, Receipt, Flag, TrendingUp,
  Wallet, Hourglass, SquarePen, MessageCircle, Mail, MailOpen, Settings,
  Shield, PiggyBank, PlusCircle, LayoutGrid, Bell, LogOut,
  ChevronLeft, RefreshCw, CalendarClock,
} from "lucide-react";

import { AppMetaFooter } from "./AppMetaFooter";
import { apiRequest } from "../lib/api";
import { getInitials } from "../lib/format";
import { getAuthToken } from "../lib/storage";
import type { AppUser } from "../lib/types";
import { cn } from "../lib/utils";

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
  icon: ReactNode;
  shortLabel?: string;
};

function I({ icon: Icon, size = 17 }: { icon: React.ElementType; size?: number }) {
  return <Icon size={size} strokeWidth={2} aria-hidden="true" />;
}

const mainNav: NavItem[] = [
  { to: "/",         label: "ホーム",       icon: <I icon={Home} />,          shortLabel: "ホーム" },
  { to: "/inbox",    label: "インボックス", icon: <I icon={Inbox} />,         shortLabel: "受信" },
  { to: "/ledger",   label: "家計簿",       icon: <I icon={Receipt} />,       shortLabel: "家計簿" },
  { to: "/goals",    label: "目標",         icon: <I icon={Flag} />,          shortLabel: "目標" },
  { to: "/progress", label: "進捗",         icon: <I icon={TrendingUp} />,    shortLabel: "進捗" },
];

const manageNav: NavItem[] = [
  { to: "/accounts", label: "口座",         icon: <I icon={Wallet} />,        shortLabel: "口座" },
  { to: "/impulse",  label: "保留リスト",   icon: <I icon={Hourglass} />,     shortLabel: "保留" },
  { to: "/record",   label: "記録追加",     icon: <I icon={SquarePen} />,     shortLabel: "記録" },
];

const toolNav: NavItem[] = [
  { to: "/chat",     label: "AI相談",       icon: <I icon={MessageCircle} />, shortLabel: "AI" },
  { to: "/mail",     label: "ウェブメール", icon: <I icon={Mail} />,          shortLabel: "メール" },
  { to: "/mailbox",  label: "受信メール",   icon: <I icon={MailOpen} />,      shortLabel: "受信" },
  { to: "/settings", label: "設定",         icon: <I icon={Settings} />,      shortLabel: "設定" },
];

const adminNav: NavItem[] = [
  { to: "/invite",   label: "招待管理",     icon: <I icon={Mail} />,          shortLabel: "招待" },
  { to: "/admin",    label: "システム",     icon: <I icon={Shield} />,        shortLabel: "管理" },
];

const mobileBottomNav = [
  { to: "/",        label: "ホーム",   icon: Home,       shortLabel: "ホーム" },
  { to: "/ledger",  label: "家計簿",   icon: Receipt,    shortLabel: "家計簿" },
  { to: "/record",  label: "記録",     icon: SquarePen,  shortLabel: "記録",  isRecord: true },
  { to: "/goals",   label: "目標",     icon: Flag,       shortLabel: "目標" },
  { to: "/more",    label: "その他",   icon: LayoutGrid, shortLabel: "その他" },
] as const;

function SidebarItem({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      onClick={onClick}
      className={({ isActive }) => cn("layout-nav-item", isActive && "is-active")}
    >
      <span className="layout-nav-item__icon">{item.icon}</span>
      <span className="truncate">{item.label}</span>
    </NavLink>
  );
}

function NavGroup({ heading, items, onNavigate }: { heading: string; items: NavItem[]; onNavigate?: () => void }) {
  return (
    <div className="layout-nav-group">
      <p className="layout-nav-heading">{heading}</p>
      <div className="layout-nav-items">
        {items.map(item => (
          <SidebarItem key={item.to} item={item} onClick={onNavigate} />
        ))}
      </div>
    </div>
  );
}

export function AppLayout({ title, subtitle, user, onLogout, children }: AppLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    document.dispatchEvent(new CustomEvent("tamelog:refresh"));
    setTimeout(() => setRefreshing(false), 800);
  }, [refreshing]);

  const isAdmin = user.role === "ADMIN";
  const token = getAuthToken();

  useEffect(() => {
    let cancelled = false;
    const fetchCount = async () => {
      try {
        const res = await apiRequest<{ count: number }>("/api/notifications/unread-count", { token });
        if (!cancelled) setUnreadCount(res.count ?? 0);
      } catch { /* ignore */ }
    };
    void fetchCount();
    const id = setInterval(() => { void fetchCount(); }, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [location.pathname]);

  const paydayLabel = useMemo(() => `毎月${user.paydayOfMonth}日`, [user.paydayOfMonth]);
  const isRootPage = location.pathname === "/";
  const unreadLabel = unreadCount > 99 ? "99+" : unreadCount > 0 ? String(unreadCount) : null;
  const initials = getInitials(user.name);

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  return (
    <div className="flex min-h-dvh overflow-x-hidden bg-[var(--bg)]">

      {/* ─── PC Sidebar ──────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-[248px] shrink-0 sticky top-0 h-screen overflow-y-auto layout-sidebar">

        <Link to="/" className="layout-brand">
          <div className="layout-brand-mark">
            <PiggyBank size={18} strokeWidth={2} />
          </div>
          <div>
            <div className="layout-brand-name">TameLog</div>
            <div className="layout-brand-kicker">貯めログ</div>
          </div>
        </Link>

        <div className="layout-sidebar-cta">
          <button
            onClick={() => navigate("/record")}
            className="btn btn--fill btn--sm w-full"
            type="button"
          >
            <PlusCircle size={14} strokeWidth={2.5} />
            今日の記録を追加
          </button>
          <div className="layout-sidebar-meta">
            <span className={cn("layout-surface-pill", isAdmin && "layout-surface-pill--brand")}>
              {isAdmin ? "ADMIN" : "USER"}
            </span>
            <span className="layout-surface-pill">
              <CalendarClock size={10} />
              {paydayLabel}締め
            </span>
          </div>
        </div>

        <nav className="layout-sidebar-nav">
          <NavGroup heading="メイン"  items={mainNav} />
          <NavGroup heading="管理"    items={manageNav} />
          <NavGroup heading="ツール"  items={toolNav} />
          {isAdmin && <NavGroup heading="管理者" items={adminNav} />}
        </nav>

        <div className="layout-user-card">
          <div className="layout-user-inner">
            <div className="layout-user-avatar">{initials}</div>
            <div className="flex-1 min-w-0">
              <div className="layout-user-name">{user.name}</div>
              <div className="layout-user-email">{user.email}</div>
            </div>
            {onLogout && (
              <button
                onClick={() => void onLogout()}
                className="layout-logout-btn"
                title="ログアウト"
                type="button"
                aria-label="ログアウト"
              >
                <LogOut size={14} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* ─── Main column ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* ── Mobile layout ── */}
        <div className="lg:hidden flex flex-col h-dvh w-full overflow-hidden">

          <header className="mobile-header">
            <div className="mobile-header-inner">
              <div className="mobile-header-left">
                {!isRootPage ? (
                  <button
                    aria-label="戻る"
                    onClick={() => navigate(-1)}
                    className="icon-btn -ml-1"
                    type="button"
                  >
                    <ChevronLeft size={20} strokeWidth={2.5} />
                  </button>
                ) : (
                  <Link to="/" className="mobile-brand">
                    <div className="mobile-brand-mark">
                      <PiggyBank size={14} strokeWidth={2} />
                    </div>
                    <span className="mobile-brand-name">TameLog</span>
                  </Link>
                )}
                {!isRootPage && (
                  <h1 className="mobile-page-title ml-1">{title}</h1>
                )}
              </div>
              <div className="mobile-header-right">
                <button
                  aria-label="更新"
                  onClick={() => void handleRefresh()}
                  className={cn("icon-btn", refreshing && "animate-spin")}
                  type="button"
                >
                  <RefreshCw
                    size={16}
                    strokeWidth={2}
                    style={refreshing ? { color: "var(--brand)" } : undefined}
                  />
                </button>
                <NavLink to="/notif" aria-label="お知らせ" className="icon-btn relative">
                  <Bell size={18} strokeWidth={2} />
                  {unreadLabel && (
                    <span className="notif-dot">{unreadLabel}</span>
                  )}
                </NavLink>
                <button
                  aria-label="メニューを開く"
                  onClick={() => setMenuOpen(true)}
                  className="mobile-avatar-btn ml-1"
                  type="button"
                >
                  {initials}
                </button>
              </div>
            </div>
          </header>

          <main
            ref={mainRef}
            className="flex-1 overflow-y-auto overflow-x-hidden bg-[var(--bg)]"
          >
            <div className="p-5 pb-8">
              {children}
            </div>
            <AppMetaFooter />
          </main>

          <nav className="mobile-bottom-nav">
            {mobileBottomNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) => cn(
                  "mobile-nav-item",
                  isActive && "is-active",
                  "isRecord" in item && item.isRecord && "mobile-nav-item--record",
                )}
              >
                <span className="mobile-nav-item__icon">
                  <item.icon size={22} strokeWidth={1.8} />
                </span>
                <span className="mobile-nav-item__label">{item.shortLabel}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        {/* ── PC Main ── */}
        <div className="hidden lg:flex flex-col flex-1 min-w-0">

          <header className="layout-topbar">
            <div>
              <h1 className="layout-topbar-title">{title}</h1>
              {subtitle && (
                <p className="text-sm mt-0.5" style={{ color: "var(--text-2)" }}>{subtitle}</p>
              )}
            </div>
            <div className="layout-topbar-actions">
              <span className="layout-surface-pill">
                <CalendarClock size={10} />
                {paydayLabel}締め
              </span>
              <NavLink to="/notif" aria-label="お知らせ" className="icon-btn relative">
                <Bell size={18} strokeWidth={2} />
                {unreadLabel && (
                  <span className="notif-dot">{unreadLabel}</span>
                )}
              </NavLink>
              <button
                onClick={() => navigate("/record")}
                className="btn btn--fill btn--sm"
                type="button"
              >
                <SquarePen size={14} strokeWidth={2.5} />
                記録
              </button>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto overflow-x-hidden bg-[var(--bg)]" style={{ padding: "40px 48px 72px" }}>
            {children}
            <AppMetaFooter />
          </main>
        </div>
      </div>

      {/* ─── Mobile Menu Sheet ─── */}
      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="menu-sheet-overlay absolute inset-0"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="menu-sheet animate-slide-up relative">
            <div className="menu-sheet-handle" />

            <div className="menu-sheet-user">
              <div className="menu-sheet-user-info">
                <div className="menu-sheet-avatar">{initials}</div>
                <div>
                  <div className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>{user.name}</div>
                  <div className="text-[12px]" style={{ color: "var(--text-3)" }}>{user.email}</div>
                </div>
              </div>
              <button
                className="menu-sheet-close-btn"
                onClick={() => setMenuOpen(false)}
                type="button"
              >
                閉じる
              </button>
            </div>

            <div className="menu-sheet-body">
              {[
                { heading: "ふり返る", items: [
                  { to: "/inbox",    label: "候補インボックス", icon: <I icon={Inbox} /> },
                  { to: "/progress", label: "進捗レポート",     icon: <I icon={TrendingUp} /> },
                  { to: "/impulse",  label: "保留リスト",       icon: <I icon={Hourglass} /> },
                ] as NavItem[] },
                { heading: "ツール", items: [
                  { to: "/chat",    label: "AI相談",    icon: <I icon={MessageCircle} /> },
                  { to: "/mailbox", label: "受信メール", icon: <I icon={MailOpen} /> },
                ] as NavItem[] },
                { heading: "アカウント", items: [
                  { to: "/accounts", label: "口座管理", icon: <I icon={Wallet} /> },
                  { to: "/settings", label: "設定",     icon: <I icon={Settings} /> },
                ] as NavItem[] },
                ...(isAdmin ? [{ heading: "管理者", items: adminNav }] : []),
              ].map(({ heading, items }) => (
                <NavGroup key={heading} heading={heading} items={items} onNavigate={() => setMenuOpen(false)} />
              ))}
            </div>

            <div style={{ margin: "0 16px 8px", borderTop: "1px solid var(--border)" }} />

            <div className="menu-sheet-logout">
              {onLogout && (
                <button
                  className="btn btn--danger btn--block"
                  onClick={() => { setMenuOpen(false); void onLogout(); }}
                  type="button"
                >
                  <LogOut size={15} strokeWidth={2} />
                  ログアウト
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
