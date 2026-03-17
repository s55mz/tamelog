import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";

import { Hono } from "hono";
import { z } from "zod";

import { checkDbReady } from "../lib/db";
import { jsonError } from "../lib/errors";
import { ensureDefaultServiceCategories } from "../lib/filtering";
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
  appName: z.string().trim().min(1).max(100).optional(),
  defaultPayday: z.number().int().min(1).max(31).optional(),
  openaiApiKey: z.string().trim().optional().nullable()
});

const testEmailSchema = z.object({
  to: z.string().trim().email()
});

const serviceDomainCreateSchema = z.object({
  categoryCode: z.enum(["EC", "PAYMENT"]),
  domain: z.string().trim().min(1).max(255),
  enabled: z.boolean().default(true)
});

const serviceDomainUpdateSchema = z.object({
  domain: z.string().trim().min(1).max(255),
  enabled: z.boolean()
});

const vpnClientSchema = z.object({
  userId: z.string().min(1),
  vpnIp: z.string().trim().min(1).max(64),
  publicKey: z.string().trim().max(255).optional().nullable(),
  status: z.enum(["PENDING", "ACTIVE", "DISABLED"])
});

type AdminVpnPeer = {
  protocol: "IKEV2" | "WIREGUARD";
  identity: string;
  endpoint: string;
  assignedIp: string | null;
  connectedSince: string | null;
  lastSeen: string | null;
  isOnline: boolean;
  transferRx: number;
  transferTx: number;
};

function parseWireGuardPeers(output: string): AdminVpnPeer[] {
  const lines = output.trim().split("\n");

  return lines.slice(1).flatMap((line) => {
    const [publicKey, , endpoint, allowedIPs, lastHandshake, transferRx, transferTx] = line.split("\t");

    if (!publicKey) {
      return [];
    }

    const lastSeen = lastHandshake !== "0" ? new Date(Number(lastHandshake) * 1000).toISOString() : null;
    const assignedIp = allowedIPs?.split(",")[0]?.trim().replace(/\/\d+$/, "") || null;

    return [
      {
        protocol: "WIREGUARD",
        identity: publicKey,
        endpoint: endpoint || "",
        assignedIp,
        connectedSince: null,
        lastSeen,
        isOnline: lastHandshake !== "0" && (Date.now() / 1000 - Number(lastHandshake)) < 180,
        transferRx: Number(transferRx) || 0,
        transferTx: Number(transferTx) || 0
      }
    ];
  });
}

function parseIpsecPeers(output: string): AdminVpnPeer[] {
  const lines = output.split("\n");
  const peers: AdminVpnPeer[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim();

    if (!line || !line.includes("ESTABLISHED") || !line.includes("...")) {
      continue;
    }

    const establishedMatch = line.match(/ESTABLISHED\s+(.+?),/);
    const remoteSegment = line.split("...").at(-1)?.trim() ?? "";
    const remoteMatch = remoteSegment.match(/^([^\s\[]+)(?:\[(.+?)\])?$/);

    let assignedIp: string | null = null;

    for (let offset = 1; offset <= 3 && index + offset < lines.length; offset += 1) {
      const childLine = lines[index + offset]?.trim() ?? "";
      const tunnelMatch = childLine.match(/===\s+([0-9a-fA-F:.]+)(?:\/\d+)?$/);

      if (tunnelMatch) {
        assignedIp = tunnelMatch[1];
        break;
      }
    }

    peers.push({
      protocol: "IKEV2",
      identity: remoteMatch?.[2] ?? remoteSegment,
      endpoint: remoteMatch?.[1] ?? "",
      assignedIp,
      connectedSince: establishedMatch?.[1] ?? null,
      lastSeen: null,
      isOnline: true,
      transferRx: 0,
      transferTx: 0
    });
  }

  return peers;
}

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
        registerUrl: `${process.env.APP_URL ?? "https://finance-pro.space"}/register?token=${invitation.token}`
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
      openaiConfigured: Boolean(config?.openaiApiKey),
      openaiApiKeyMasked: config?.openaiApiKey
        ? `${config.openaiApiKey.slice(0, 7)}...${config.openaiApiKey.slice(-4)}`
        : ""
    }
  });
});

adminRoutes.put("/config", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = configSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "入力内容を確認してください", 400);
  }

  const existing = await prisma.systemConfig.findUnique({ where: { id: "system" } });

  // If openaiApiKey is "***" or matches existing masked key, preserve existing
  const shouldUpdateKey =
    parsed.data.openaiApiKey !== undefined &&
    parsed.data.openaiApiKey !== "***" &&
    !parsed.data.openaiApiKey?.includes("...");

  const config = await prisma.systemConfig.upsert({
    where: { id: "system" },
    update: {
      ...(parsed.data.appName !== undefined ? { appName: parsed.data.appName } : {}),
      ...(parsed.data.defaultPayday !== undefined ? { paydayOfMonth: parsed.data.defaultPayday } : {}),
      ...(shouldUpdateKey ? { openaiApiKey: parsed.data.openaiApiKey || null } : {})
    },
    create: {
      id: "system",
      installed: true,
      appName: parsed.data.appName ?? "貯めログ",
      paydayOfMonth: parsed.data.defaultPayday ?? 25,
      openaiApiKey: shouldUpdateKey ? (parsed.data.openaiApiKey || null) : null
    }
  });

  return c.json({
    data: {
      appName: config.appName,
      defaultPayday: config.paydayOfMonth,
      openaiConfigured: Boolean(config.openaiApiKey)
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

adminRoutes.get("/service-categories", async (c) => {
  await ensureDefaultServiceCategories(prisma as never);

  const categories = await prisma.serviceCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      domains: {
        orderBy: { domain: "asc" }
      },
      _count: {
        select: {
          blockSchedules: true
        }
      }
    }
  });

  return c.json({
    data: {
      categories: categories.map((category) => ({
        id: category.id,
        code: category.code,
        name: category.name,
        sortOrder: category.sortOrder,
        scheduleCount: category._count.blockSchedules,
        domains: category.domains.map((domain) => ({
          id: domain.id,
          domain: domain.domain,
          enabled: domain.enabled,
          createdAt: domain.createdAt.toISOString()
        }))
      }))
    }
  });
});

adminRoutes.post("/service-domains", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = serviceDomainCreateSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "入力内容を確認してください", 400);
  }

  await ensureDefaultServiceCategories(prisma as never);

  const category = await prisma.serviceCategory.findUnique({
    where: { code: parsed.data.categoryCode }
  });

  if (!category) {
    return jsonError(c, "カテゴリが見つかりません", 404);
  }

  try {
    const domain = await prisma.serviceDomain.create({
      data: {
        categoryId: category.id,
        domain: parsed.data.domain.toLowerCase(),
        enabled: parsed.data.enabled
      }
    });

    return c.json(
      {
        data: {
          domain: {
            id: domain.id,
            categoryId: domain.categoryId,
            domain: domain.domain,
            enabled: domain.enabled
          }
        }
      },
      201
    );
  } catch (error) {
    console.error("service-domain:create", error);
    return jsonError(c, "ドメインの保存に失敗しました", 400);
  }
});

adminRoutes.put("/service-domains/:id", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = serviceDomainUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "入力内容を確認してください", 400);
  }

  const existing = await prisma.serviceDomain.findUnique({
    where: { id: c.req.param("id") }
  });

  if (!existing) {
    return jsonError(c, "ドメインが見つかりません", 404);
  }

  try {
    const domain = await prisma.serviceDomain.update({
      where: { id: existing.id },
      data: {
        domain: parsed.data.domain.toLowerCase(),
        enabled: parsed.data.enabled
      }
    });

    return c.json({
      data: {
        domain: {
          id: domain.id,
          categoryId: domain.categoryId,
          domain: domain.domain,
          enabled: domain.enabled
        }
      }
    });
  } catch (error) {
    console.error("service-domain:update", error);
    return jsonError(c, "ドメインの更新に失敗しました", 400);
  }
});

adminRoutes.delete("/service-domains/:id", async (c) => {
  const existing = await prisma.serviceDomain.findUnique({
    where: { id: c.req.param("id") }
  });

  if (!existing) {
    return jsonError(c, "ドメインが見つかりません", 404);
  }

  await prisma.serviceDomain.delete({
    where: { id: existing.id }
  });

  return c.json({
    data: {
      success: true
    }
  });
});

adminRoutes.get("/vpn-clients", async (c) => {
  const clients = await prisma.vpnClient.findMany({
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });

  return c.json({
    data: {
      clients: clients.map((client) => ({
        id: client.id,
        vpnIp: client.vpnIp,
        publicKey: client.publicKey,
        status: client.status,
        updatedAt: client.updatedAt.toISOString(),
        user: client.user
      }))
    }
  });
});

adminRoutes.post("/vpn-clients", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = vpnClientSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "入力内容を確認してください", 400);
  }

  try {
    const client = await prisma.vpnClient.create({
      data: {
        userId: parsed.data.userId,
        vpnIp: parsed.data.vpnIp,
        publicKey: parsed.data.publicKey || null,
        status: parsed.data.status
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    return c.json(
      {
        data: {
          client: {
            id: client.id,
            vpnIp: client.vpnIp,
            publicKey: client.publicKey,
            status: client.status,
            updatedAt: client.updatedAt.toISOString(),
            user: client.user
          }
        }
      },
      201
    );
  } catch (error) {
    console.error("vpn-client:create", error);
    return jsonError(c, "VPNクライアントの保存に失敗しました", 400);
  }
});

adminRoutes.put("/vpn-clients/:id", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = vpnClientSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "入力内容を確認してください", 400);
  }

  const existing = await prisma.vpnClient.findUnique({
    where: { id: c.req.param("id") }
  });

  if (!existing) {
    return jsonError(c, "VPNクライアントが見つかりません", 404);
  }

  try {
    const client = await prisma.vpnClient.update({
      where: { id: existing.id },
      data: {
        userId: parsed.data.userId,
        vpnIp: parsed.data.vpnIp,
        publicKey: parsed.data.publicKey || null,
        status: parsed.data.status
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    return c.json({
      data: {
        client: {
          id: client.id,
          vpnIp: client.vpnIp,
          publicKey: client.publicKey,
          status: client.status,
          updatedAt: client.updatedAt.toISOString(),
          user: client.user
        }
      }
    });
  } catch (error) {
    console.error("vpn-client:update", error);
    return jsonError(c, "VPNクライアントの更新に失敗しました", 400);
  }
});

adminRoutes.delete("/vpn-clients/:id", async (c) => {
  const existing = await prisma.vpnClient.findUnique({
    where: { id: c.req.param("id") }
  });

  if (!existing) {
    return jsonError(c, "VPNクライアントが見つかりません", 404);
  }

  await prisma.vpnClient.delete({
    where: { id: existing.id }
  });

  return c.json({
    data: {
      success: true
    }
  });
});

adminRoutes.get("/vpn-status", async (c) => {
  const peers: AdminVpnPeer[] = [];
  const sources: string[] = [];
  const errors: string[] = [];

  try {
    const output = execSync("sudo ipsec statusall 2>&1", { encoding: "utf8", timeout: 5000 });
    sources.push("IKEv2");
    peers.push(...parseIpsecPeers(output));
  } catch {
    errors.push("ipsec statusall");
  }

  try {
    const output = execSync("sudo wg show wg0 dump", { encoding: "utf8", timeout: 5000 });
    sources.push("WireGuard");
    peers.push(...parseWireGuardPeers(output));
  } catch {
    errors.push("wg show wg0 dump");
  }

  const uniquePeers = peers.filter((peer, index, allPeers) =>
    allPeers.findIndex((candidate) =>
      candidate.protocol === peer.protocol
      && candidate.identity === peer.identity
      && candidate.endpoint === peer.endpoint
    ) === index
  );

  return c.json({
    data: {
      peers: uniquePeers,
      source: sources.join(" + "),
      error:
        sources.length === 0
          ? `VPN 状態を取得できませんでした (${errors.join(", ")})`
          : undefined
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
