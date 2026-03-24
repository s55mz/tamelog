import { useEffect, useState } from "react";

export type ApiStatus = "ok" | "degraded" | "unreachable" | "loading";

export function useApiStatus(intervalMs = 60_000): ApiStatus {
  const [status, setStatus] = useState<ApiStatus>("loading");

  const check = async () => {
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      if (!res.ok) { setStatus("degraded"); return; }
      const json = await res.json() as { data?: { status?: string } };
      setStatus(json.data?.status === "ok" ? "ok" : "degraded");
    } catch {
      setStatus("unreachable");
    }
  };

  useEffect(() => {
    void check();
    const id = setInterval(() => { void check(); }, intervalMs);
    return () => clearInterval(id);
  }, []);

  return status;
}
