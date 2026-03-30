import { useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { useToast } from "./lib/toast";

import { useBootstrap } from "./hooks/useBootstrap";
import { isNotificationPromptDeferred } from "./lib/onboarding";
import { isPushSubscribed } from "./lib/push";
import { AccountsPage } from "./pages/AccountsPage";
import { AdminPage } from "./pages/AdminPage";
import { ChatPage } from "./pages/ChatPage";
import { DashboardPage } from "./pages/DashboardPage";
import { GoalsPage } from "./pages/GoalsPage";
import { InboxPage } from "./pages/InboxPage";
import { ImpulsePage } from "./pages/ImpulsePage";
import { InvitePage } from "./pages/InvitePage";
import { LedgerPage } from "./pages/LedgerPage";
import { MailboxPage } from "./pages/MailboxPage";
import { WebMailPage } from "./pages/WebMailPage";
import { MorePage } from "./pages/MorePage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { LoginPage } from "./pages/LoginPage";
import { NotificationPromptPage } from "./pages/NotificationPromptPage";
import { ProgressPage } from "./pages/ProgressPage";
import { RecordPage } from "./pages/RecordPage";
import { RegisterPage } from "./pages/RegisterPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SetupPage } from "./pages/SetupPage";
import { UserSetupPage } from "./pages/UserSetupPage";

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

type SessionState = ReturnType<typeof useBootstrap>;

function fallbackPath(session: SessionState) {
  if (!session.installed) {
    return "/setup";
  }

  if (!session.token) {
    return "/login";
  }

  if (!session.user?.setupCompleted) {
    return "/user-setup";
  }

  return "/";
}

function AuthGate({
  session,
  children,
  adminOnly = false,
  allowNotificationPrompt = false
}: {
  session: SessionState;
  children: ReactNode;
  adminOnly?: boolean;
  allowNotificationPrompt?: boolean;
}) {
  if (!session.installed) {
    return <Navigate replace to="/setup" />;
  }

  if (!session.token || !session.user) {
    return <Navigate replace to="/login" />;
  }

  if (!session.user.setupCompleted) {
    return <Navigate replace to="/user-setup" />;
  }

  if (adminOnly && session.user.role !== "ADMIN") {
    return <Navigate replace to="/" />;
  }

  if (!allowNotificationPrompt) {
    return <NotificationGate session={session}>{children}</NotificationGate>;
  }

  return <>{children}</>;
}

function NotificationGate({
  session,
  children
}: {
  session: SessionState;
  children: ReactNode;
}) {
  const [checking, setChecking] = useState(true);
  const [needsPrompt, setNeedsPrompt] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!session.token || !session.user?.setupCompleted) {
      setNeedsPrompt(false);
      setChecking(false);
      return () => undefined;
    }

    if (
      !("Notification" in window)
      || !("serviceWorker" in navigator)
      || !("PushManager" in window)
      || isNotificationPromptDeferred()
    ) {
      setNeedsPrompt(false);
      setChecking(false);
      return () => undefined;
    }

    setChecking(true);
    void isPushSubscribed()
      .then((subscribed) => {
        if (cancelled) return;
        setNeedsPrompt(!(Notification.permission === "granted" && subscribed));
      })
      .catch(() => {
        if (cancelled) return;
        setNeedsPrompt(Notification.permission !== "granted");
      })
      .finally(() => {
        if (cancelled) return;
        setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session.token, session.user?.id, session.user?.setupCompleted]);

  if (checking) {
    return <div className="fullscreen-message">読み込み中...</div>;
  }

  if (needsPrompt) {
    return <Navigate replace to="/notifications" />;
  }

  return <>{children}</>;
}

function UpdateRedirect() {
  const navigate = useNavigate();
  const toast = useToast();
  useEffect(() => {
    const flag = sessionStorage.getItem("_tamelog_updated");
    if (flag) {
      sessionStorage.removeItem("_tamelog_updated");
      navigate("/", { replace: true });
      setTimeout(() => toast("バージョンを更新しました"), 100);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function App() {
  const session = useBootstrap();

  if (session.loading || session.resolving) {
    return <div className="fullscreen-message">読み込み中...</div>;
  }

  return (
    <>
      <UpdateRedirect />
      <ScrollToTop />
      <Routes>
        <Route
          path="/setup"
          element={
            session.installed ? (
              <Navigate replace to={fallbackPath(session)} />
            ) : (
              <SetupPage />
            )
          }
        />
        <Route
          path="/login"
          element={
            session.installed ? (
              session.token ? (
                <Navigate replace to={fallbackPath(session)} />
              ) : (
                <LoginPage onLogin={session.setTokenState} />
              )
            ) : (
              <Navigate replace to="/setup" />
            )
          }
        />
        <Route
          path="/register"
          element={session.installed ? <RegisterPage /> : <Navigate replace to="/setup" />}
        />
        <Route
          path="/user-setup"
          element={
            session.installed ? (
              session.token && session.user ? (
                session.user.setupCompleted ? (
                  <Navigate replace to="/" />
                ) : (
                  <UserSetupPage onCompleted={session.refreshUser} />
                )
              ) : (
                <Navigate replace to="/login" />
              )
            ) : (
              <Navigate replace to="/setup" />
            )
          }
        />
        <Route
          path="/notifications"
          element={
            session.installed ? (
              session.token && session.user ? (
                session.user.setupCompleted ? (
                  <AuthGate allowNotificationPrompt session={session}>
                    <NotificationPromptPage token={session.token} />
                  </AuthGate>
                ) : (
                  <Navigate replace to="/user-setup" />
                )
              ) : (
                <Navigate replace to="/login" />
              )
            ) : (
              <Navigate replace to="/setup" />
            )
          }
        />
        <Route
          path="/"
          element={
            <AuthGate session={session}>
              <DashboardPage
                onLogout={() => session.setTokenState(null)}
                user={session.user!}
              />
            </AuthGate>
          }
        />
        <Route
          path="/inbox"
          element={
            <AuthGate session={session}>
              <InboxPage onLogout={() => session.setTokenState(null)} user={session.user!} />
            </AuthGate>
          }
        />
        <Route
          path="/record"
          element={
            <AuthGate session={session}>
              <RecordPage onLogout={() => session.setTokenState(null)} user={session.user!} />
            </AuthGate>
          }
        />
        <Route
          path="/goals"
          element={
            <AuthGate session={session}>
              <GoalsPage onLogout={() => session.setTokenState(null)} user={session.user!} />
            </AuthGate>
          }
        />
        <Route
          path="/ledger"
          element={
            <AuthGate session={session}>
              <LedgerPage onLogout={() => session.setTokenState(null)} user={session.user!} />
            </AuthGate>
          }
        />
        <Route
          path="/accounts"
          element={
            <AuthGate session={session}>
              <AccountsPage onLogout={() => session.setTokenState(null)} user={session.user!} />
            </AuthGate>
          }
        />
        <Route
          path="/progress"
          element={
            <AuthGate session={session}>
              <ProgressPage onLogout={() => session.setTokenState(null)} user={session.user!} />
            </AuthGate>
          }
        />
        <Route
          path="/impulse"
          element={
            <AuthGate session={session}>
              <ImpulsePage onLogout={() => session.setTokenState(null)} user={session.user!} />
            </AuthGate>
          }
        />
        <Route
          path="/chat"
          element={
            <AuthGate session={session}>
              <ChatPage onLogout={() => session.setTokenState(null)} user={session.user!} />
            </AuthGate>
          }
        />
        <Route
          path="/settings"
          element={
            <AuthGate session={session}>
              <SettingsPage onLogout={() => session.setTokenState(null)} user={session.user!} />
            </AuthGate>
          }
        />
        <Route
          path="/invite"
          element={
            <AuthGate adminOnly session={session}>
              <InvitePage onLogout={() => session.setTokenState(null)} user={session.user!} />
            </AuthGate>
          }
        />
        <Route
          path="/admin"
          element={
            <AuthGate adminOnly session={session}>
              <AdminPage onLogout={() => session.setTokenState(null)} user={session.user!} />
            </AuthGate>
          }
        />
        <Route
          path="/mailbox"
          element={
            <AuthGate session={session}>
              <MailboxPage onLogout={() => session.setTokenState(null)} user={session.user!} />
            </AuthGate>
          }
        />
        <Route
          path="/notif"
          element={
            <AuthGate session={session}>
              <NotificationsPage onLogout={() => session.setTokenState(null)} user={session.user!} />
            </AuthGate>
          }
        />
        <Route
          path="/more"
          element={
            <AuthGate session={session}>
              <MorePage onLogout={() => session.setTokenState(null)} user={session.user!} />
            </AuthGate>
          }
        />
        <Route
          path="/mail"
          element={
            <AuthGate session={session}>
              <WebMailPage onLogout={() => session.setTokenState(null)} user={session.user!} />
            </AuthGate>
          }
        />
        <Route path="*" element={<Navigate replace to={fallbackPath(session)} />} />
      </Routes>
    </>
  );
}
