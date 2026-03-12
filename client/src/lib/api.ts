const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  token?: string | null;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const json = (await response.json().catch(() => null)) as
    | { data?: T; error?: string }
    | null;

  if (!response.ok || !json?.data) {
    throw new Error(json?.error ?? "通信に失敗しました");
  }

  return json.data;
}

export { apiBaseUrl };
