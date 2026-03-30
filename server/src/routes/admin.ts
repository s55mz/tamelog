import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { Hono } from "hono";
import { z } from "zod";

import { checkDbReady } from "../lib/db";
import { jsonError } from "../lib/errors";
import { ensureDefaultServiceCategories } from "../lib/filtering";
import { mailInvitation, sendMail } from "../lib/mail";
import { prisma } from "../lib/prisma";
import { readIpsecStatus, readWireGuardDump } from "../lib/vpnRuntime";
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

const resetDatabaseSchema = z.object({
  confirmationText: z.literal("INITIALIZE")
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

  const inviter = await prisma.user.findUnique({ where: { id: authUser.id }, select: { name: true } });
  const invitation = await prisma.invitation.create({
    data: {
      email: parsed.data.email,
      token: randomUUID(),
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      invitedByUserId: authUser.id
    }
  });

  const appUrl = process.env.APP_URL ?? "https://finance-pro.space";
  const registerUrl = `${appUrl}/register?token=${invitation.token}`;

  // 招待メール送信
  const mailContent = mailInvitation(registerUrl, inviter?.name ?? "管理者");
  sendMail({ to: invitation.email, ...mailContent }).catch((err: unknown) =>
    console.error("[MAIL] 招待メール送信失敗:", err)
  );

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
        registerUrl
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
    const output = readIpsecStatus();
    sources.push("IKEv2");
    peers.push(...parseIpsecPeers(output));
  } catch {
    errors.push("ipsec statusall");
  }

  try {
    const output = readWireGuardDump();
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

adminRoutes.post("/reset-database", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = resetDatabaseSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "確認テキストが一致しません", 400);
  }

  const tables = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
    "select tablename from pg_tables where schemaname = 'public' and tablename <> '_prisma_migrations' order by tablename"
  );

  if (tables.length === 0) {
    return c.json({
      data: {
        success: true,
        tableCount: 0
      }
    });
  }

  const tableList = tables
    .map((table) => `"${table.tablename.replace(/"/g, "\"\"")}"`)
    .join(", ");

  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);

  return c.json({
    data: {
      success: true,
      tableCount: tables.length
    }
  });
});

// ── サーバーリソース & サービス状態 ──────────────────────────────────
adminRoutes.get("/server-status", requireAuth, requireAdmin, (c) => {
  // CPU: load average + core count → utilization %
  let loadAvg = [0, 0, 0];
  let cpuCores = 1;
  let processCount = 0;
  try {
    const raw = readFileSync("/proc/loadavg", "utf8").trim().split(" ");
    loadAvg = [parseFloat(raw[0]), parseFloat(raw[1]), parseFloat(raw[2])];
    processCount = parseInt(raw[3]?.split("/")[1] ?? "0", 10);
  } catch { /* fallback */ }
  try {
    cpuCores = parseInt(execSync("nproc", { encoding: "utf8", timeout: 1000 }).trim(), 10) || 1;
  } catch { /* fallback */ }

  // Memory + Swap (bytes)
  let memTotal = 0, memAvailable = 0, swapTotal = 0, swapFree = 0;
  try {
    const raw = readFileSync("/proc/meminfo", "utf8");
    const get = (key: string) => {
      const m = raw.match(new RegExp(`^${key}:\\s+(\\d+)`, "m"));
      return m ? parseInt(m[1]) * 1024 : 0;
    };
    memTotal     = get("MemTotal");
    memAvailable = get("MemAvailable");
    swapTotal    = get("SwapTotal");
    swapFree     = get("SwapFree");
  } catch { /* fallback */ }

  // Disk
  let diskTotal = 0, diskUsed = 0;
  try {
    const raw = execSync("df -B1 / | tail -1", { encoding: "utf8", timeout: 3000 });
    const parts = raw.trim().split(/\s+/);
    diskTotal = parseInt(parts[1]);
    diskUsed  = parseInt(parts[2]);
  } catch { /* fallback */ }

  // Network (cumulative bytes since boot from /proc/net/dev)
  let netRx = 0, netTx = 0;
  try {
    const raw = readFileSync("/proc/net/dev", "utf8");
    for (const line of raw.split("\n")) {
      const m = line.trim().match(/^(\w+):\s+(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/);
      if (m && m[1] !== "lo") { netRx += parseInt(m[2]); netTx += parseInt(m[3]); }
    }
  } catch { /* fallback */ }

  // OS uptime (seconds)
  let osUptimeSec = 0;
  try {
    osUptimeSec = Math.floor(parseFloat(readFileSync("/proc/uptime", "utf8").split(" ")[0]));
  } catch { /* fallback */ }

  // Service status (one systemctl call for all)
  const SERVICE_DEFS = [
    { name: "nginx",                 label: "Nginx",         group: "web"  },
    { name: "tamelog-api",           label: "API サーバー",   group: "app"  },
    { name: "tamelog-dns",           label: "DNS フィルター", group: "vpn"  },
    { name: "tamelog-block-https",   label: "HTTPS ブロック", group: "vpn"  },
    { name: "tamelog-mitm",          label: "MITM フィルター",group: "vpn"  },
    { name: "postgresql@16-main",    label: "PostgreSQL",    group: "db"   },
    { name: "postfix",               label: "Postfix (Mail)",group: "mail" },
    { name: "opendkim",              label: "OpenDKIM",      group: "mail" },
    { name: "cloudflared",           label: "Cloudflare",    group: "web"  },
    { name: "fail2ban",              label: "Fail2Ban",      group: "sec"  },
  ];

  const services = SERVICE_DEFS.map(({ name, label, group }) => {
    let active = "unknown";
    try {
      active = execSync(`systemctl is-active ${name} 2>/dev/null`, { encoding: "utf8", timeout: 2000 }).trim();
    } catch { active = "inactive"; }
    return { name, label, group, active };
  });

  // fail2ban stats
  let bannedCount = 0, failedCount = 0;
  try {
    const fb = execSync("fail2ban-client status sshd 2>/dev/null", { encoding: "utf8", timeout: 3000 });
    const bm = fb.match(/Currently banned:\s+(\d+)/);
    const fm = fb.match(/Currently failed:\s+(\d+)/);
    if (bm) bannedCount = parseInt(bm[1]);
    if (fm) failedCount = parseInt(fm[1]);
  } catch { /* ignore */ }

  // DB size
  let dbSizeBytes = 0;
  try {
    const row = execSync(
      `sudo -u postgres psql tamelogdb -t -c "SELECT pg_database_size('tamelogdb');" 2>/dev/null`,
      { encoding: "utf8", timeout: 3000 }
    ).trim();
    dbSizeBytes = parseInt(row, 10) || 0;
  } catch { /* ignore */ }

  // Node process memory
  const nodeMem = process.memoryUsage();

  return c.json({
    data: {
      cpu: {
        loadAvg,
        cores: cpuCores,
        usagePct: Math.min(Math.round((loadAvg[0] / cpuCores) * 100), 100),
      },
      mem: {
        total: memTotal,
        available: memAvailable,
        used: memTotal - memAvailable,
        swapTotal,
        swapUsed: swapTotal - swapFree,
      },
      disk: { total: diskTotal, used: diskUsed },
      net: { rx: netRx, tx: netTx },
      osUptimeSec,
      processCount,
      services,
      security: { bannedCount, failedCount },
      db: { sizeBytes: dbSizeBytes },
      node: { rss: nodeMem.rss, heapUsed: nodeMem.heapUsed, heapTotal: nodeMem.heapTotal },
    }
  });
});

// ── ログビューア ──────────────────────────────────────────────────────
adminRoutes.get("/logs", requireAuth, requireAdmin, (c) => {
  const lines = parseInt(c.req.query("lines") ?? "80", 10);
  const n = Math.min(Math.max(lines, 10), 200);

  let entries: string[] = [];
  try {
    const raw = execSync(`tail -n ${n} /var/log/tamelog.log 2>/dev/null`, {
      encoding: "utf8",
      timeout: 3000
    });
    entries = raw.split("\n").filter(Boolean);
  } catch { /* ignore */ }

  return c.json({ data: { entries } });
});
