import { Hono } from "hono";
import { z } from "zod";

import { jsonError } from "../lib/errors";
import { requireAuth, type AuthContext } from "../middleware/auth";
import { prisma } from "../lib/prisma";

const createImpulseSchema = z.object({
  name: z.string().trim().min(1).max(100),
  price: z.number().int().positive(),
  message: z.string().trim().max(500).optional().nullable()
});

const updateImpulseSchema = z.object({
  status: z.enum(["BOUGHT", "SKIPPED"])
});

export const impulseRoutes = new Hono<AuthContext>();

impulseRoutes.use("*", requireAuth);

impulseRoutes.get("/", async (c) => {
  const authUser = c.get("authUser");
  const items = await prisma.impulseItem.findMany({
    where: { userId: authUser.id },
    orderBy: { createdAt: "desc" }
  });

  return c.json({
    data: {
      waiting: items
        .filter((item) => item.status === "WAITING")
        .map((item) => ({
          id: item.id,
          name: item.name,
          price: item.price,
          message: item.message,
          status: item.status,
          createdAt: item.createdAt.toISOString(),
          canDecide: Date.now() - item.createdAt.getTime() >= 24 * 60 * 60 * 1000
        })),
      history: items
        .filter((item) => item.status !== "WAITING")
        .map((item) => ({
          id: item.id,
          name: item.name,
          price: item.price,
          message: item.message,
          status: item.status,
          createdAt: item.createdAt.toISOString(),
          decisionAt: item.decisionAt?.toISOString() ?? null
        }))
    }
  });
});

impulseRoutes.post("/", async (c) => {
  const authUser = c.get("authUser");
  const body = await c.req.json().catch(() => null);
  const parsed = createImpulseSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "入力内容を確認してください", 400);
  }

  const item = await prisma.impulseItem.create({
    data: {
      userId: authUser.id,
      name: parsed.data.name,
      price: parsed.data.price,
      message: parsed.data.message ?? null
    }
  });

  return c.json({ data: { item } }, 201);
});

impulseRoutes.put("/:id", async (c) => {
  const authUser = c.get("authUser");
  const body = await c.req.json().catch(() => null);
  const parsed = updateImpulseSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "入力内容を確認してください", 400);
  }

  const item = await prisma.impulseItem.findFirst({
    where: { id: c.req.param("id"), userId: authUser.id }
  });

  if (!item) {
    return jsonError(c, "項目が見つかりません", 404);
  }

  if (item.status !== "WAITING") {
    return jsonError(c, "この項目は更新できません", 400);
  }

  if (Date.now() - item.createdAt.getTime() < 24 * 60 * 60 * 1000) {
    return jsonError(c, "待機時間がまだ終了していません", 400);
  }

  const updated = await prisma.impulseItem.update({
    where: { id: item.id },
    data: {
      status: parsed.data.status,
      decisionAt: new Date()
    }
  });

  return c.json({ data: { item: updated } });
});

impulseRoutes.delete("/:id", async (c) => {
  const authUser = c.get("authUser");
  const item = await prisma.impulseItem.findFirst({
    where: { id: c.req.param("id"), userId: authUser.id }
  });

  if (!item) {
    return jsonError(c, "項目が見つかりません", 404);
  }

  await prisma.impulseItem.delete({
    where: { id: item.id }
  });

  return c.json({
    data: {
      success: true
    }
  });
});
