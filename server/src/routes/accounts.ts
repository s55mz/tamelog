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
