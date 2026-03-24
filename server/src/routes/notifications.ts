import { Hono } from "hono";

import { jsonError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { requireAuth, type AuthContext } from "../middleware/auth";

export const notificationsRoutes = new Hono<AuthContext>();

// 一覧取得（最新50件 + 未読数）
notificationsRoutes.get("/", requireAuth, async (c) => {
  const user = c.get("authUser");
  const [notifications, unreadCount] = await Promise.all([
    prisma.appNotification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50
    }),
    prisma.appNotification.count({ where: { userId: user.id, isRead: false } })
  ]);
  return c.json({ data: { notifications, unreadCount } });
});

// 未読数のみ取得
notificationsRoutes.get("/unread-count", requireAuth, async (c) => {
  const user = c.get("authUser");
  const count = await prisma.appNotification.count({ where: { userId: user.id, isRead: false } });
  return c.json({ data: { count } });
});

// 1件既読
notificationsRoutes.patch("/:id/read", requireAuth, async (c) => {
  const user = c.get("authUser");
  const id = c.req.param("id");
  const notif = await prisma.appNotification.findFirst({ where: { id, userId: user.id } });
  if (!notif) return jsonError(c, "見つかりません", 404);
  await prisma.appNotification.update({ where: { id }, data: { isRead: true } });
  return c.json({ data: { success: true } });
});

// 全件既読
notificationsRoutes.post("/read-all", requireAuth, async (c) => {
  const user = c.get("authUser");
  await prisma.appNotification.updateMany({ where: { userId: user.id, isRead: false }, data: { isRead: true } });
  return c.json({ data: { success: true } });
});

// 削除
notificationsRoutes.delete("/:id", requireAuth, async (c) => {
  const user = c.get("authUser");
  const id = c.req.param("id");
  await prisma.appNotification.deleteMany({ where: { id, userId: user.id } });
  return c.json({ data: { success: true } });
});
