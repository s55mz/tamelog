import { Hono } from "hono";
import * as vm from "vm";

import { prisma } from "../lib/prisma";
import { requireAuth, type AuthContext } from "../middleware/auth";

export const webmailRoutes = new Hono<AuthContext>();
webmailRoutes.use("/*", requireAuth);

const MAIL_DOMAIN = process.env.MAIL_DOMAIN ?? "inbox.finance-pro.space";
const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{5,29}$/;

// ─── Helper: find mailbox or null ─────────────────────────────────────────────

async function getMailbox(userId: string) {
  return prisma.inboundMailbox.findUnique({ where: { userId } });
}

// ─── Run user script in sandboxed vm ─────────────────────────────────────────

function runUserScript(
  code: string,
  email: { from: string; subject: string; body: string }
): { star?: boolean; folder?: string; markRead?: boolean } {
  const result: { star?: boolean; folder?: string; markRead?: boolean } = {};
  const sandbox = {
    email: { from: email.from, subject: email.subject, body: email.body },
    star() { result.star = true; },
    moveToTrash() { result.folder = "trash"; },
    markAsRead() { result.markRead = true; },
    console: { log: () => undefined },
  };
  try {
    vm.runInNewContext(code, sandbox, { timeout: 2000 });
  } catch (e) {
    console.log("[WEBMAIL] User script error:", e);
  }
  return result;
}

// ─── Export for ingest hook ───────────────────────────────────────────────────

export async function applyUserScriptToMessage(
  userId: string,
  messageId: string,
  email: { from: string; subject: string; body: string }
) {
  const script = await prisma.userMailScript.findUnique({ where: { userId } });
  if (!script?.enabled || !script.code.trim()) return;

  const actions = runUserScript(script.code, email);
  const update: Record<string, unknown> = {};
  if (actions.star) update.isStarred = true;
  if (actions.folder) update.folder = actions.folder;
  if (actions.markRead) update.isRead = true;

  if (Object.keys(update).length > 0) {
    await prisma.inboundMessage.update({ where: { id: messageId }, data: update });
  }
}

// ─── GET /api/webmail/me ──────────────────────────────────────────────────────

webmailRoutes.get("/me", async (c) => {
  const { id: userId } = c.get("authUser");
  const mailbox = await getMailbox(userId);
  return c.json({
    data: {
      isSetup: !!mailbox,
      address: mailbox?.address ?? null,
      mailDomain: MAIL_DOMAIN
    }
  });
});

// ─── POST /api/webmail/setup ──────────────────────────────────────────────────

webmailRoutes.post("/setup", async (c) => {
  const { id: userId } = c.get("authUser");

  const existing = await getMailbox(userId);
  if (existing) return c.json({ error: "メールボックスはすでに設定されています" }, 400);

  const body = await c.req.json().catch(() => ({})) as { username?: string };
  const username = (body.username ?? "").toLowerCase().trim();

  if (!USERNAME_RE.test(username)) {
    return c.json({ error: "ユーザー名は6〜30文字の英数字・ハイフン・アンダースコアのみ使えます" }, 400);
  }

  const address = `${username}@${MAIL_DOMAIN}`;
  const taken = await prisma.inboundMailbox.findUnique({ where: { address } });
  if (taken) return c.json({ error: "このユーザー名はすでに使われています" }, 409);

  const mailbox = await prisma.inboundMailbox.create({
    data: { userId, address, token: username, status: "ACTIVE" }
  });

  return c.json({ data: { address: mailbox.address } }, 201);
});

// ─── GET /api/webmail/messages ────────────────────────────────────────────────

webmailRoutes.get("/messages", async (c) => {
  const { id: userId } = c.get("authUser");
  const mailbox = await getMailbox(userId);
  if (!mailbox) return c.json({ data: { messages: [], total: 0 } });

  const folder = c.req.query("folder") ?? "inbox";
  const unreadOnly = c.req.query("unread") === "1";
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 100);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  const where = {
    mailboxId: mailbox.id,
    folder,
    deletedAt: folder === "trash" ? { not: null } : null,
    ...(unreadOnly ? { isRead: false } : {})
  };

  // folder=trash は deletedAt が設定されているもの。それ以外は deletedAt=null のみ
  const baseWhere = folder === "trash"
    ? { mailboxId: mailbox.id, deletedAt: { not: null as null } }
    : { mailboxId: mailbox.id, folder, deletedAt: null };

  const finalWhere = unreadOnly ? { ...baseWhere, isRead: false } : baseWhere;

  const [messages, total] = await Promise.all([
    prisma.inboundMessage.findMany({
      where: finalWhere,
      orderBy: { receivedAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        fromAddress: true,
        subject: true,
        receivedAt: true,
        isRead: true,
        isStarred: true,
        folder: true,
        rawText: true,
        parseStatus: true,
        candidates: { select: { id: true, status: true } }
      }
    }),
    prisma.inboundMessage.count({ where: finalWhere })
  ]);

  // preview: first 120 chars of body
  const result = messages.map((m) => ({
    ...m,
    preview: m.rawText ? m.rawText.replace(/\s+/g, " ").trim().slice(0, 120) : "",
    rawText: undefined
  }));

  return c.json({ data: { messages: result, total } });
});

// ─── GET /api/webmail/messages/:id ───────────────────────────────────────────

webmailRoutes.get("/messages/:id", async (c) => {
  const { id: userId } = c.get("authUser");
  const mailbox = await getMailbox(userId);
  if (!mailbox) return c.json({ error: "メールボックスが見つかりません" }, 404);

  const message = await prisma.inboundMessage.findFirst({
    where: { id: c.req.param("id"), mailboxId: mailbox.id },
    include: { candidates: { select: { id: true, status: true, candidateType: true, amount: true, title: true } } }
  });
  if (!message) return c.json({ error: "メールが見つかりません" }, 404);

  // Mark as read
  if (!message.isRead) {
    await prisma.inboundMessage.update({ where: { id: message.id }, data: { isRead: true } });
  }

  return c.json({ data: { ...message, isRead: true } });
});

// ─── PATCH /api/webmail/messages/:id ─────────────────────────────────────────

webmailRoutes.patch("/messages/:id", async (c) => {
  const { id: userId } = c.get("authUser");
  const mailbox = await getMailbox(userId);
  if (!mailbox) return c.json({ error: "メールボックスが見つかりません" }, 404);

  const message = await prisma.inboundMessage.findFirst({
    where: { id: c.req.param("id"), mailboxId: mailbox.id }
  });
  if (!message) return c.json({ error: "メールが見つかりません" }, 404);

  const body = await c.req.json().catch(() => ({})) as {
    isStarred?: boolean;
    isRead?: boolean;
    folder?: string;
  };

  const update: Record<string, unknown> = {};
  if (typeof body.isStarred === "boolean") update.isStarred = body.isStarred;
  if (typeof body.isRead === "boolean") update.isRead = body.isRead;
  if (typeof body.folder === "string" && ["inbox", "trash"].includes(body.folder)) {
    update.folder = body.folder;
    update.deletedAt = body.folder === "trash" ? new Date() : null;
  }

  const updated = await prisma.inboundMessage.update({ where: { id: message.id }, data: update });
  return c.json({ data: updated });
});

// ─── DELETE /api/webmail/messages/:id ────────────────────────────────────────

webmailRoutes.delete("/messages/:id", async (c) => {
  const { id: userId } = c.get("authUser");
  const mailbox = await getMailbox(userId);
  if (!mailbox) return c.json({ error: "メールボックスが見つかりません" }, 404);

  const message = await prisma.inboundMessage.findFirst({
    where: { id: c.req.param("id"), mailboxId: mailbox.id }
  });
  if (!message) return c.json({ error: "メールが見つかりません" }, 404);

  if (message.deletedAt) {
    // Already in trash → permanent delete
    await prisma.inboundMessage.delete({ where: { id: message.id } });
    return c.json({ data: { deleted: true, permanent: true } });
  }

  // Move to trash
  await prisma.inboundMessage.update({
    where: { id: message.id },
    data: { folder: "trash", deletedAt: new Date() }
  });
  return c.json({ data: { deleted: true, permanent: false } });
});

// ─── GET /api/webmail/counts ──────────────────────────────────────────────────

webmailRoutes.get("/counts", async (c) => {
  const { id: userId } = c.get("authUser");
  const mailbox = await getMailbox(userId);
  if (!mailbox) return c.json({ data: { inbox: 0, starred: 0, trash: 0 } });

  const [inbox, starred, trash] = await Promise.all([
    prisma.inboundMessage.count({ where: { mailboxId: mailbox.id, folder: "inbox", deletedAt: null, isRead: false } }),
    prisma.inboundMessage.count({ where: { mailboxId: mailbox.id, isStarred: true, deletedAt: null } }),
    prisma.inboundMessage.count({ where: { mailboxId: mailbox.id, deletedAt: { not: null } } })
  ]);

  return c.json({ data: { inbox, starred, trash } });
});

// ─── GET /api/webmail/script ──────────────────────────────────────────────────

webmailRoutes.get("/script", async (c) => {
  const { id: userId } = c.get("authUser");
  const script = await prisma.userMailScript.findUnique({ where: { userId } });
  return c.json({
    data: {
      code: script?.code ?? "",
      enabled: script?.enabled ?? true
    }
  });
});

// ─── PUT /api/webmail/script ──────────────────────────────────────────────────

webmailRoutes.put("/script", async (c) => {
  const { id: userId } = c.get("authUser");
  const body = await c.req.json().catch(() => ({})) as { code?: string; enabled?: boolean };

  const code = typeof body.code === "string" ? body.code.slice(0, 10000) : "";
  const enabled = typeof body.enabled === "boolean" ? body.enabled : true;

  // Validate syntax
  if (code.trim()) {
    try {
      new vm.Script(code);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "構文エラー";
      return c.json({ error: `構文エラー: ${msg}` }, 400);
    }
  }

  const script = await prisma.userMailScript.upsert({
    where: { userId },
    create: { userId, code, enabled },
    update: { code, enabled }
  });

  return c.json({ data: { code: script.code, enabled: script.enabled } });
});
