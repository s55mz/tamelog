import type { Context } from "hono";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

export function jsonError(c: Context, message: string, status: number) {
  return c.json({ error: message }, status as 400 | 401 | 403 | 404 | 409 | 500);
}
