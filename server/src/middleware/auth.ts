import type { MiddlewareHandler } from "hono";

import { verifyAuthToken } from "../lib/auth";
import { jsonError } from "../lib/errors";
import { prisma } from "../lib/prisma";

type UserRole = "ADMIN" | "USER";

export type AuthContext = {
  Variables: {
    authUser: {
      id: string;
      role: UserRole;
    };
  };
};

export const requireAuth: MiddlewareHandler<AuthContext> = async (c, next) => {
  const header = c.req.header("Authorization");

  if (!header?.startsWith("Bearer ")) {
    return jsonError(c, "ログインが必要です", 401);
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = verifyAuthToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, status: true }
    });

    if (!user || user.status !== "ACTIVE") {
      return jsonError(c, "ログインが必要です", 401);
    }

    c.set("authUser", { id: user.id, role: user.role });
    await next();
  } catch {
    return jsonError(c, "ログインが必要です", 401);
  }
};
