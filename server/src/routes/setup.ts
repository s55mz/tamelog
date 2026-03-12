import { Hono } from "hono";
import { z } from "zod";

import { checkDbReady } from "../lib/db";
import { jsonError } from "../lib/errors";
import { hashPassword } from "../lib/password";
import { prisma } from "../lib/prisma";

const installSchema = z.object({
  adminName: z.string().trim().min(1).max(100),
  adminEmail: z.string().trim().email(),
  password: z.string().min(8).max(100),
  appName: z.string().trim().min(1).max(100),
  paydayOfMonth: z.number().int().min(1).max(31)
});

export const setupRoutes = new Hono();

setupRoutes.get("/status", async (c) => {
  try {
    await checkDbReady();
    const config = await prisma.systemConfig.findUnique({
      where: { id: "system" }
    });

    return c.json({
      data: {
        installed: config?.installed ?? false,
        dbReady: true
      }
    });
  } catch {
    return c.json({
      data: {
        installed: false,
        dbReady: false
      }
    });
  }
});

setupRoutes.post("/test-db", async (c) => {
  try {
    await checkDbReady();
    return c.json({
      data: {
        success: true
      }
    });
  } catch {
    return jsonError(c, "DB に接続できません", 500);
  }
});

setupRoutes.post("/install", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = installSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "入力内容を確認してください", 400);
  }

  const installed = await prisma.systemConfig.findUnique({
    where: { id: "system" }
  });

  if (installed?.installed) {
    return jsonError(c, "すでにセットアップ済みです", 409);
  }

  const passwordHash = await hashPassword(parsed.data.password);

  await prisma.$transaction(async (tx) => {
    await tx.user.create({
      data: {
        name: parsed.data.adminName,
        email: parsed.data.adminEmail,
        passwordHash,
        role: "ADMIN",
        status: "ACTIVE",
        setupCompleted: true,
        paydayOfMonth: parsed.data.paydayOfMonth
      }
    });

    await tx.systemConfig.upsert({
      where: { id: "system" },
      update: {
        installed: true,
        appName: parsed.data.appName,
        paydayOfMonth: parsed.data.paydayOfMonth,
        installedAt: new Date()
      },
      create: {
        id: "system",
        installed: true,
        appName: parsed.data.appName,
        paydayOfMonth: parsed.data.paydayOfMonth,
        installedAt: new Date()
      }
    });
  });

  return c.json(
    {
      data: {
        installed: true
      }
    },
    201
  );
});
