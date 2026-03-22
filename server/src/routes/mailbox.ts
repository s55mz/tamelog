import { Hono } from "hono";

import { prisma } from "../lib/prisma";
import { requireAuth, type AuthContext } from "../middleware/auth";

export const mailboxRoutes = new Hono<AuthContext>();

mailboxRoutes.use("/*", requireAuth);

// GET /api/mailbox/messages — 受信メール一覧
mailboxRoutes.get("/messages", async (c) => {
  const authUser = c.get("authUser");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 100);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  // ユーザーのメールボックスを取得
  const mailboxes = await prisma.inboundMailbox.findMany({
    where: { userId: authUser.id },
    select: { id: true }
  });
  const mailboxIds = mailboxes.map((m) => m.id);

  if (mailboxIds.length === 0) {
    return c.json({ data: { messages: [], total: 0 } });
  }

  const [messages, total] = await Promise.all([
    prisma.inboundMessage.findMany({
      where: { mailboxId: { in: mailboxIds } },
      orderBy: { receivedAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        fromAddress: true,
        subject: true,
        receivedAt: true,
        parseStatus: true,
        rawText: true,
        candidates: {
          select: { id: true, status: true, candidateType: true, amount: true }
        }
      }
    }),
    prisma.inboundMessage.count({ where: { mailboxId: { in: mailboxIds } } })
  ]);

  return c.json({ data: { messages, total } });
});

// DELETE /api/mailbox/messages/:id — 受信メール削除
mailboxRoutes.delete("/messages/:id", async (c) => {
  const authUser = c.get("authUser");

  const mailboxes = await prisma.inboundMailbox.findMany({
    where: { userId: authUser.id },
    select: { id: true }
  });
  const mailboxIds = mailboxes.map((m) => m.id);

  const message = await prisma.inboundMessage.findFirst({
    where: { id: c.req.param("id"), mailboxId: { in: mailboxIds } }
  });

  if (!message) {
    return c.json({ error: "メールが見つかりません" }, 404);
  }

  await prisma.inboundMessage.delete({ where: { id: message.id } });

  return c.json({ data: { success: true } });
});
