import { useEffect, useState } from "react";

import { apiRequest } from "../lib/api";
import { clearAuthToken, getAuthToken, setAuthToken } from "../lib/storage";

type SetupStatus = {
  installed: boolean;
  dbReady: boolean;
};

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  setupCompleted: boolean;
  paydayOfMonth: number;
};

export function useBootstrap() {
  const [loading, setLoading] = useState(true);
  // token と user を解決中かどうか（ログイン直後などの遷移ロック）
  const [resolving, setResolving] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [token, setToken] = useState<string | null>(getAuthToken());
  const [user, setUser] = useState<AuthUser | null>(null);

  const refreshUser = async (nextToken = token) => {
    if (!nextToken) {
      setUser(null);
      return;
    }

    try {
      const data = await apiRequest<{ user: AuthUser }>("/api/auth/me", {
        token: nextToken
      });
      setUser(data.user);
    } catch {
      setUser(null);
    }
  };

  const setTokenState = async (nextToken: string | null) => {
    // resolving中はルーターが誤ったリダイレクトをしないようにする
    setResolving(true);
    try {
      if (nextToken) {
        setAuthToken(nextToken);
      } else {
        clearAuthToken();
      }
      setToken(nextToken);
      await refreshUser(nextToken);
    } finally {
      setResolving(false);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiRequest<SetupStatus>("/api/setup/status");
        setInstalled(data.installed);

        if (data.installed && token) {
          await refreshUser(token);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return {
    loading,
    resolving,
    installed,
    token,
    user,
    refreshUser,
    setTokenState
  };
}
