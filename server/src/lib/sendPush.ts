import webpush from "web-push";

import { mailAppNotification, sendMail } from "./mail";
import { prisma } from "./prisma";

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY ?? "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY ?? "";
const vapidSubject = process.env.VAPID_SUBJECT ?? "mailto:admin@finance-pro.space";

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string }
): Promise<void> {
  const notifUrl = payload.url ?? "/notif";

  // アプリ内通知を作成 + メール送信
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
  await prisma.appNotification.create({
    data: { userId, title: payload.title, body: payload.body ?? null, url: notifUrl }
  }).catch(() => {});
  if (user?.email) {
    const mailContent = mailAppNotification(user.name, payload.title, payload.body, notifUrl);
    sendMail({ to: user.email, ...mailContent }).catch(() => {});
  }

  if (!vapidPublicKey || !vapidPrivateKey) return;

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return;

  const message = JSON.stringify({ title: payload.title, body: payload.body, url: notifUrl });

  await Promise.allSettled(
    subs.map((sub) =>
      webpush
        .sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          message
        )
        .catch(async (err: webpush.WebPushError) => {
          if (err.statusCode === 410) {
            await prisma.pushSubscription.delete({ where: { endpoint: sub.endpoint } }).catch(() => {});
          }
        })
    )
  );
}
