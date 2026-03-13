import { Hono } from "hono";
import { z } from "zod";

import { ensureDefaultCategories } from "../lib/defaultCategories";
import { jsonError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { requireAuth, type AuthContext } from "../middleware/auth";

const categorySchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(["INCOME", "EXPENSE"])
});

export const categoriesRoutes = new Hono<AuthContext>();

categoriesRoutes.use("*", requireAuth);

categoriesRoutes.get("/", async (c) => {
  const authUser = c.get("authUser");
  const type = c.req.query("type");

  await ensureDefaultCategories(authUser.id);

  const categories = await prisma.category.findMany({
    where: {
      userId: authUser.id,
      ...(type ? { type: type as "INCOME" | "EXPENSE" } : {})
    },
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }]
  });

  return c.json({
    data: {
      categories
    }
  });
});

categoriesRoutes.post("/", async (c) => {
  const authUser = c.get("authUser");
  const body = await c.req.json().catch(() => null);
  const parsed = categorySchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "入力内容を確認してください", 400);
  }

  const sortOrder =
    (await prisma.category.count({
      where: { userId: authUser.id, type: parsed.data.type }
    })) + 1;

  const category = await prisma.category.create({
    data: {
      userId: authUser.id,
      name: parsed.data.name,
      type: parsed.data.type,
      sortOrder,
      isDefault: false
    }
  });

  return c.json({ data: { category } }, 201);
});

categoriesRoutes.put("/:id", async (c) => {
  const authUser = c.get("authUser");
  const body = await c.req.json().catch(() => null);
  const parsed = categorySchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "入力内容を確認してください", 400);
  }

  const existing = await prisma.category.findFirst({
    where: { id: c.req.param("id"), userId: authUser.id }
  });

  if (!existing) {
    return jsonError(c, "カテゴリが見つかりません", 404);
  }

  const category = await prisma.category.update({
    where: { id: existing.id },
    data: {
      name: parsed.data.name,
      type: parsed.data.type
    }
  });

  return c.json({ data: { category } });
});

categoriesRoutes.delete("/:id", async (c) => {
  const authUser = c.get("authUser");
  const existing = await prisma.category.findFirst({
    where: { id: c.req.param("id"), userId: authUser.id }
  });

  if (!existing) {
    return jsonError(c, "カテゴリが見つかりません", 404);
  }

  const recordCount = await prisma.dailyRecord.count({
    where: { userId: authUser.id, categoryId: existing.id }
  });

  if (recordCount > 0) {
    return jsonError(c, "このカテゴリは削除できません", 409);
  }

  await prisma.category.delete({
    where: { id: existing.id }
  });

  return c.json({ data: { success: true } });
});

categoriesRoutes.post("/reset-defaults", async (c) => {
  const authUser = c.get("authUser");

  await prisma.category.deleteMany({
    where: {
      userId: authUser.id,
      isDefault: true
    }
  });

  await ensureDefaultCategories(authUser.id);

  const categories = await prisma.category.findMany({
    where: { userId: authUser.id },
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }]
  });

  return c.json({
    data: {
      categories
    }
  });
});
