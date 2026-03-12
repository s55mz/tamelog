import { Navigate, Route, Routes } from "react-router-dom";

import { RegisterPage } from "./pages/RegisterPage";
import { SetupPage } from "./pages/SetupPage";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { UserSetupPage } from "./pages/UserSetupPage";
import { RecordPage } from "./pages/RecordPage";
import { LedgerPage } from "./pages/LedgerPage";
import { AccountsPage } from "./pages/AccountsPage";
import { ProgressPage } from "./pages/ProgressPage";
import { useBootstrap } from "./hooks/useBootstrap";

export default function App() {
  const { loading, installed, token, user, refreshUser, setTokenState } = useBootstrap();

  if (loading) {
    return <div className="fullscreen-message">読み込み中...</div>;
  }

  return (
    <Routes>
      <Route
        path="/setup"
        element={
          installed ? <Navigate to={token ? "/" : "/login"} replace /> : <SetupPage />
        }
      />
      <Route
        path="/login"
        element={
          installed ? (
            token ? (
              <Navigate to="/" replace />
            ) : (
              <LoginPage onLogin={setTokenState} />
            )
          ) : (
            <Navigate to="/setup" replace />
          )
        }
      />
      <Route
        path="/register"
        element={installed ? <RegisterPage /> : <Navigate to="/setup" replace />}
      />
      <Route
        path="/"
        element={
          token && user ? (
            user.setupCompleted ? (
              <DashboardPage user={user} onLogout={() => setTokenState(null)} />
            ) : (
              <Navigate to="/user-setup" replace />
            )
          ) : (
            <Navigate to={installed ? "/login" : "/setup"} replace />
          )
        }
      />
      <Route
        path="/record"
        element={
          token && user ? (user.setupCompleted ? <RecordPage /> : <Navigate to="/user-setup" replace />) : <Navigate to={installed ? "/login" : "/setup"} replace />
        }
      />
      <Route
        path="/ledger"
        element={
          token && user ? (user.setupCompleted ? <LedgerPage /> : <Navigate to="/user-setup" replace />) : <Navigate to={installed ? "/login" : "/setup"} replace />
        }
      />
      <Route
        path="/accounts"
        element={
          token && user ? (user.setupCompleted ? <AccountsPage /> : <Navigate to="/user-setup" replace />) : <Navigate to={installed ? "/login" : "/setup"} replace />
        }
      />
      <Route
        path="/progress"
        element={
          token && user ? (user.setupCompleted ? <ProgressPage /> : <Navigate to="/user-setup" replace />) : <Navigate to={installed ? "/login" : "/setup"} replace />
        }
      />
      <Route
        path="/user-setup"
        element={
          token && user ? (
            user.setupCompleted ? (
              <Navigate to="/" replace />
            ) : (
              <UserSetupPage onCompleted={refreshUser} />
            )
          ) : (
            <Navigate to={installed ? "/login" : "/setup"} replace />
          )
        }
      />
      <Route
        path="*"
        element={
          <Navigate
            to={
              installed
                ? token
                  ? user?.setupCompleted
                    ? "/"
                    : "/user-setup"
                  : "/login"
                : "/setup"
            }
            replace
          />
        }
      />
    </Routes>
  );
}
