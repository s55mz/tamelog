import { randomUUID } from "node:crypto";

import { Hono } from "hono";
import { z } from "zod";

import { checkDbReady } from "../lib/db";
import { jsonError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { requireAdmin } from "../middleware/admin";
import { requireAuth, type AuthContext } from "../middleware/auth";

const invitationSchema = z.object({
  email: z.string().trim().email()
});

const suspendSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"])
});

const configSchema = z.object({
  appName: z.string().trim().min(1).max(100),
  defaultPayday: z.number().int().min(1).max(31),
  smtp: z.object({
    host: z.string().trim().optional(),
    port: z.number().int().optional(),
    user: z.string().trim().optional(),
    pass: z.string().trim().optional(),
    from: z.string().trim().optional()
  }),
  openai: z.object({
    apiKey: z.string().trim().optional()
  })
});

const testEmailSchema = z.object({
  to: z.string().trim().email()
});

export const adminRoutes = new Hono<AuthContext>();

adminRoutes.use("*", requireAuth, requireAdmin);

adminRoutes.get("/users", async (c) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" }
  });

  return c.json({
    data: {
      users: users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        setupCompleted: user.setupCompleted,
        createdAt: user.createdAt.toISOString()
      })),
      summary: {
        total: users.length,
        adminCount: users.filter((user) => user.role === "ADMIN").length,
        userCount: users.filter((user) => user.role === "USER").length
      }
    }
  });
});

adminRoutes.post("/users/:id/suspend", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = suspendSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "入力内容を確認してください", 400);
  }

  const target = await prisma.user.findUnique({
    where: { id: c.req.param("id") }
  });

  if (!target) {
    return jsonError(c, "ユーザーが見つかりません", 404);
  }

  const user = await prisma.user.update({
    where: { id: target.id },
    data: {
      status: parsed.data.status
    }
  });

  return c.json({
    data: {
      user: {
        id: user.id,
        status: user.status
      }
    }
  });
});

adminRoutes.post("/invitations", async (c) => {
  const authUser = c.get("authUser");
  const body = await c.req.json().catch(() => null);
  const parsed = invitationSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "入力内容を確認してください", 400);
  }

  const invitation = await prisma.invitation.create({
    data: {
      email: parsed.data.email,
      token: randomUUID(),
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      invitedByUserId: authUser.id
    }
  });

  return c.json(
    {
      data: {
        invitation: {
          id: invitation.id,
          email: invitation.email,
          token: invitation.token,
          status: invitation.status,
          expiresAt: invitation.expiresAt.toISOString()
        },
        registerUrl: `http://localhost:5173/register?token=${invitation.token}`
      }
    },
    201
  );
});

adminRoutes.get("/invitations", async (c) => {
  const invitations = await prisma.invitation.findMany({
    orderBy: { createdAt: "desc" }
  });

  return c.json({
    data: {
      invitations: invitations.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        token: invitation.token,
        status: invitation.status,
        expiresAt: invitation.expiresAt.toISOString(),
        usedAt: invitation.usedAt?.toISOString() ?? null
      }))
    }
  });
});

adminRoutes.post("/invitations/:id/revoke", async (c) => {
  const invitation = await prisma.invitation.findUnique({
    where: { id: c.req.param("id") }
  });

  if (!invitation) {
    return jsonError(c, "招待が見つかりません", 404);
  }

  const updated = await prisma.invitation.update({
    where: { id: invitation.id },
    data: {
      status: "REVOKED",
      revokedAt: new Date()
    }
  });

  return c.json({
    data: {
      invitation: {
        id: updated.id,
        status: updated.status
      }
    }
  });
});

adminRoutes.get("/config", async (c) => {
  const config = await prisma.systemConfig.findUnique({
    where: { id: "system" }
  });

  return c.json({
    data: {
      appName: config?.appName ?? "貯めログ",
      defaultPayday: config?.paydayOfMonth ?? 25,
      smtp: {
        host: process.env.SMTP_HOST ?? "",
        port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 0,
        user: process.env.SMTP_USER ?? "",
        from: process.env.SMTP_FROM ?? "",
        configured: Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM)
      },
      openai: {
        configured: Boolean(process.env.OPENAI_API_KEY)
      }
    }
  });
});

adminRoutes.put("/config", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = configSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "入力内容を確認してください", 400);
  }

  const config = await prisma.systemConfig.upsert({
    where: { id: "system" },
    update: {
      appName: parsed.data.appName,
      paydayOfMonth: parsed.data.defaultPayday
    },
    create: {
      id: "system",
      installed: true,
      appName: parsed.data.appName,
      paydayOfMonth: parsed.data.defaultPayday
    }
  });

  return c.json({
    data: {
      appName: config.appName,
      defaultPayday: config.paydayOfMonth
    }
  });
});

adminRoutes.post("/test-email", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = testEmailSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "入力内容を確認してください", 400);
  }

  return c.json({
    data: {
      success: true,
      message: `テストメール送信を受け付けました: ${parsed.data.to}`
    }
  });
});

adminRoutes.get("/system-info", async (c) => {
  let dbReady = false;

  try {
    await checkDbReady();
    dbReady = true;
  } catch {
    dbReady = false;
  }

  return c.json({
    data: {
      nodeVersion: process.version,
      platform: process.platform,
      uptimeSec: Math.floor(process.uptime()),
      memoryUsage: {
        rss: process.memoryUsage().rss
      },
      dbReady
    }
  });
});
