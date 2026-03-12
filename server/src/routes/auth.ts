import { Hono } from "hono";
import { z } from "zod";

import { createAuthToken, serializeUser } from "../lib/auth";
import { jsonError } from "../lib/errors";
import { verifyPassword, hashPassword } from "../lib/password";
import { prisma } from "../lib/prisma";
import { requireAuth, type AuthContext } from "../middleware/auth";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(100)
});

const registerSchema = z.object({
  token: z.string().trim().min(1),
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email(),
  password: z.string().min(8).max(100)
});

export const authRoutes = new Hono<AuthContext>();

authRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "入力内容を確認してください", 400);
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email }
  });

  if (!user || user.status !== "ACTIVE") {
    return jsonError(c, "メールアドレスまたはパスワードが違います", 401);
  }

  const validPassword = await verifyPassword(parsed.data.password, user.passwordHash);

  if (!validPassword) {
    return jsonError(c, "メールアドレスまたはパスワードが違います", 401);
  }

  return c.json({
    data: {
      token: createAuthToken(user),
      user: serializeUser(user)
    }
  });
});

authRoutes.get("/me", requireAuth, async (c) => {
  const authUser = c.get("authUser");

  const user = await prisma.user.findUnique({
    where: { id: authUser.id }
  });

  if (!user) {
    return jsonError(c, "ログインが必要です", 401);
  }

  return c.json({
    data: {
      user: serializeUser(user)
    }
  });
});

authRoutes.post("/register", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "入力内容を確認してください", 400);
  }

  const invitation = await prisma.invitation.findUnique({
    where: { token: parsed.data.token }
  });

  if (!invitation || invitation.status !== "ACTIVE") {
    return jsonError(c, "招待リンクの有効期限が切れています", 400);
  }

  if (invitation.expiresAt.getTime() < Date.now()) {
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "EXPIRED" }
    });

    return jsonError(c, "招待リンクの有効期限が切れています", 400);
  }

  if (invitation.email !== parsed.data.email) {
    return jsonError(c, "招待メールアドレスと一致しません", 400);
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: parsed.data.email }
  });

  if (existingUser) {
    return jsonError(c, "このメールアドレスはすでに使われています", 409);
  }

  const passwordHash = await hashPassword(parsed.data.password);

  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash,
        role: "USER",
        status: "ACTIVE",
        setupCompleted: false,
        paydayOfMonth: 1
      }
    });

    await tx.invitation.update({
      where: { id: invitation.id },
      data: {
        status: "USED",
        usedAt: new Date()
      }
    });

    return createdUser;
  });

  return c.json(
    {
      data: {
        user: serializeUser(user)
      }
    },
    201
  );
});

authRoutes.post("/logout", (c) =>
  c.json({
    data: {
      success: true
    }
  })
);
