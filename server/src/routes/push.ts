import { Hono } from "hono";
import webpush from "web-push";

import { jsonError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { requireAuth, type AuthContext } from "../middleware/auth";

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY ?? "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY ?? "";
const vapidSubject = process.env.VAPID_SUBJECT ?? "mailto:admin@finance-pro.space";

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

export const pushRoutes = new Hono<AuthContext>();

// VAPID公開鍵
pushRoutes.get("/vapid-public-key", (c) => {
  return c.json({ data: { publicKey: vapidPublicKey } });
});

// 購読
pushRoutes.post("/subscribe", requireAuth, async (c) => {
  const user = c.get("authUser");
  const body = await c.req.json().catch(() => null);
  if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
    return jsonError(c, "不正なリクエストです", 400);
  }
  await prisma.pushSubscription.upsert({
    where: { endpoint: body.endpoint },
    create: { userId: user.id, endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth },
    update: { userId: user.id, p256dh: body.keys.p256dh, auth: body.keys.auth }
  });
  // ウェルカム通知を送信
  try {
    await webpush.sendNotification(
      { endpoint: body.endpoint, keys: { p256dh: body.keys.p256dh, auth: body.keys.auth } },
      JSON.stringify({
        title: 'TameLog へようこそ',
        body: 'プッシュ通知が有効になりました 🎉',
        url: '/'
      })
    );
  } catch { /* ウェルカム失敗は無視 */ }
  return c.json({ data: { success: true } });
});

// 購読解除
pushRoutes.delete("/subscribe", requireAuth, async (c) => {
  const user = c.get("authUser");
  const body = await c.req.json().catch(() => null);
  await prisma.pushSubscription.deleteMany({
    where: { userId: user.id, ...(body?.endpoint ? { endpoint: body.endpoint } : {}) }
  });
  return c.json({ data: { success: true } });
});

// 購読数取得（自分のデバイス）
pushRoutes.get("/subscription-count", requireAuth, async (c) => {
  const user = c.get("authUser");
  const count = await prisma.pushSubscription.count({ where: { userId: user.id } });
  return c.json({ data: { count } });
});

// 送信（管理者のみ）
pushRoutes.post("/send", requireAuth, async (c) => {
  const user = c.get("authUser");
  if (user.role !== "ADMIN") return jsonError(c, "権限がありません", 403);
  const body = await c.req.json().catch(() => null);
  const { title = "TameLog", message = "", url = "/notif" } = body ?? {};

  // 全ユーザーにアプリ内通知を作成
  const allUsers = await prisma.user.findMany({ select: { id: true } });
  await prisma.appNotification.createMany({
    data: allUsers.map(u => ({ userId: u.id, title, body: message || null, url }))
  }).catch(() => {});

  const subs = await prisma.pushSubscription.findMany();
  const results = await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title, body: message, url })
      ).catch(async (err: webpush.WebPushError) => {
        if (err.statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { endpoint: sub.endpoint } });
        }
        throw err;
      })
    )
  );
  const sent = results.filter(r => r.status === "fulfilled").length;
  return c.json({ data: { sent, total: subs.length } });
});
