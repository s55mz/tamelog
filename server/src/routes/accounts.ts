import { Hono } from "hono";
import { z } from "zod";

import { jsonError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { requireAuth, type AuthContext } from "../middleware/auth";

const createAccountSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(["BANK", "CASH", "CREDIT"]),
  balance: z.number().int(),
  isPrimary: z.boolean().default(false)
});

const updateAccountSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  type: z.enum(["BANK", "CASH", "CREDIT"]).optional(),
  balance: z.number().int().optional(),
  isPrimary: z.boolean().optional(),
  sortOrder: z.number().int().positive().optional()
});

export const accountsRoutes = new Hono<AuthContext>();

accountsRoutes.use("*", requireAuth);

accountsRoutes.get("/", async (c) => {
  const authUser = c.get("authUser");
  const accounts = await prisma.account.findMany({
    where: { userId: authUser.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  });

  return c.json({
    data: {
      accounts,
      totalBalance: accounts.reduce((sum, account) => sum + account.balance, 0)
    }
  });
});

accountsRoutes.post("/", async (c) => {
  const authUser = c.get("authUser");
  const body = await c.req.json().catch(() => null);
  const parsed = createAccountSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "入力内容を確認してください", 400);
  }

  const sortOrder = (await prisma.account.count({ where: { userId: authUser.id } })) + 1;

  if (parsed.data.isPrimary) {
    await prisma.account.updateMany({
      where: { userId: authUser.id, isPrimary: true },
      data: { isPrimary: false }
    });
  }

  const account = await prisma.account.create({
    data: {
      userId: authUser.id,
      sortOrder,
      ...parsed.data
    }
  });

  return c.json({ data: { account } }, 201);
});

accountsRoutes.put("/:id", async (c) => {
  const authUser = c.get("authUser");
  const body = await c.req.json().catch(() => null);
  const parsed = updateAccountSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "入力内容を確認してください", 400);
  }

  const existing = await prisma.account.findFirst({
    where: { id: c.req.param("id"), userId: authUser.id }
  });

  if (!existing) {
    return jsonError(c, "口座が見つかりません", 404);
  }

  if (parsed.data.isPrimary) {
    await prisma.account.updateMany({
      where: { userId: authUser.id, isPrimary: true, id: { not: existing.id } },
      data: { isPrimary: false }
    });
  }

  const account = await prisma.account.update({
    where: { id: existing.id },
    data: parsed.data
  });

  return c.json({ data: { account } });
});

accountsRoutes.delete("/:id", async (c) => {
  const authUser = c.get("authUser");
  const existing = await prisma.account.findFirst({
    where: { id: c.req.param("id"), userId: authUser.id }
  });

  if (!existing) {
    return jsonError(c, "口座が見つかりません", 404);
  }

  const [recordCount, transferCount] = await Promise.all([
    prisma.dailyRecord.count({ where: { accountId: existing.id, userId: authUser.id } }),
    prisma.accountTransfer.count({
      where: {
        userId: authUser.id,
        OR: [{ fromAccountId: existing.id }, { toAccountId: existing.id }]
      }
    })
  ]);

  if (recordCount > 0 || transferCount > 0) {
    return jsonError(c, "この口座は削除できません", 409);
  }

  await prisma.account.delete({
    where: { id: existing.id }
  });

  return c.json({
    data: {
      success: true
    }
  });
});
