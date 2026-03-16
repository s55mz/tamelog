import { useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { useBootstrap } from "./hooks/useBootstrap";
import { AccountsPage } from "./pages/AccountsPage";
import { AdminPage } from "./pages/AdminPage";
import { ChatPage } from "./pages/ChatPage";
import { DashboardPage } from "./pages/DashboardPage";
import { GoalsPage } from "./pages/GoalsPage";
import { ImpulsePage } from "./pages/ImpulsePage";
import { InvitePage } from "./pages/InvitePage";
import { LedgerPage } from "./pages/LedgerPage";
import { LoginPage } from "./pages/LoginPage";
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
  adminOnly = false
}: {
  session: SessionState;
  children: ReactNode;
  adminOnly?: boolean;
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

  return <>{children}</>;
}

export default function App() {
  const session = useBootstrap();

  if (session.loading || session.resolving) {
    return <div className="fullscreen-message">読み込み中...</div>;
  }

  return (
    <>
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
        <Route path="*" element={<Navigate replace to={fallbackPath(session)} />} />
      </Routes>
    </>
  );
}
