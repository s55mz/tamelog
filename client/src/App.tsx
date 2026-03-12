import { Navigate, Route, Routes } from "react-router-dom";

import { RegisterPage } from "./pages/RegisterPage";
import { SetupPage } from "./pages/SetupPage";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
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
            <DashboardPage user={user} onLogout={() => setTokenState(null)} />
          ) : (
            <Navigate to={installed ? "/login" : "/setup"} replace />
          )
        }
      />
      <Route
        path="*"
        element={<Navigate to={installed ? (token ? "/" : "/login") : "/setup"} replace />}
      />
    </Routes>
  );
}
