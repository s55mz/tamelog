import type { MiddlewareHandler } from "hono";

import { jsonError } from "../lib/errors";
import type { AuthContext } from "./auth";

export const requireAdmin: MiddlewareHandler<AuthContext> = async (c, next) => {
  const authUser = c.get("authUser");

  if (authUser.role !== "ADMIN") {
    return jsonError(c, "この操作を行う権限がありません", 403);
  }

  await next();
};
