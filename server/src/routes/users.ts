import { Hono } from "hono";
import { z } from "zod";

import { serializeUser } from "../lib/auth";
import { ensureDefaultCategories } from "../lib/defaultCategories";
import { jsonError } from "../lib/errors";
import { hashPassword, verifyPassword } from "../lib/password";
import { prisma } from "../lib/prisma";
import { requireAuth, type AuthContext } from "../middleware/auth";

const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email(),
  currentPassword: z.string().min(8).max(100).optional(),
  paydayOfMonth: z.number().int().min(1).max(31)
});

const completeSetupSchema = z.object({
  paydayOfMonth: z.number().int().min(1).max(31),
  initialAccount: z
    .object({
      name: z.string().trim().min(1).max(100),
      type: z.enum(["BANK", "CASH", "CREDIT"]),
      balance: z.number().int().min(0)
    })
    .optional(),
  goals: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(100),
        targetAmount: z.number().int().positive(),
        deadline: z.string().date().optional()
      })
    )
    .max(3)
    .default([])
});

export const usersRoutes = new Hono<AuthContext>();

usersRoutes.use("*", requireAuth);

usersRoutes.get("/me", async (c) => {
  const authUser = c.get("authUser");
  const user = await prisma.user.findUnique({
    where: { id: authUser.id }
  });

  if (!user) {
    return jsonError(c, "ログインが必要です", 401);
  }

  await ensureDefaultCategories(user.id);

  return c.json({
    data: {
      ...serializeUser(user),
      streakDays: user.streakDays
    }
  });
});

usersRoutes.put("/me", async (c) => {
  const authUser = c.get("authUser");
  const body = await c.req.json().catch(() => null);
  const parsed = updateProfileSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "入力内容を確認してください", 400);
  }

  const user = await prisma.user.findUnique({
    where: { id: authUser.id }
  });

  if (!user) {
    return jsonError(c, "ログインが必要です", 401);
  }

  if (parsed.data.email !== user.email) {
    if (!parsed.data.currentPassword) {
      return jsonError(c, "メール変更には現在のパスワードが必要です", 400);
    }

    const validPassword = await verifyPassword(parsed.data.currentPassword, user.passwordHash);

    if (!validPassword) {
      return jsonError(c, "現在のパスワードが違います", 400);
    }
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      paydayOfMonth: parsed.data.paydayOfMonth
    }
  });

  return c.json({
    data: serializeUser(updated)
  });
});

usersRoutes.post("/me/complete-setup", async (c) => {
  const authUser = c.get("authUser");
  const body = await c.req.json().catch(() => null);
  const parsed = completeSetupSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "入力内容を確認してください", 400);
  }

  const user = await prisma.user.findUnique({
    where: { id: authUser.id }
  });

  if (!user) {
    return jsonError(c, "ログインが必要です", 401);
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        paydayOfMonth: parsed.data.paydayOfMonth,
        setupCompleted: true
      }
    });

    if (parsed.data.initialAccount) {
      const existingPrimary = await tx.account.findFirst({
        where: { userId: user.id, isPrimary: true }
      });
      const sortOrder = (await tx.account.count({ where: { userId: user.id } })) + 1;

      await tx.account.create({
        data: {
          userId: user.id,
          name: parsed.data.initialAccount.name,
          type: parsed.data.initialAccount.type,
          balance: parsed.data.initialAccount.balance,
          isPrimary: existingPrimary ? false : true,
          sortOrder
        }
      });
    }

    for (const goal of parsed.data.goals) {
      await tx.goal.create({
        data: {
          userId: user.id,
          title: goal.title,
          targetAmount: goal.targetAmount,
          deadline: goal.deadline ? new Date(`${goal.deadline}T00:00:00.000Z`) : null,
          visualCategory: "OTHER",
          visualSubcategory: "generic",
          visualTheme: "SOFT",
          visualLocked: false
        }
      });
    }
  });

  await ensureDefaultCategories(user.id);

  return c.json({
    data: {
      success: true
    }
  });
});
