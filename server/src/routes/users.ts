import { randomBytes } from "crypto";
import { spawn } from "child_process";

import { Hono } from "hono";
import { z } from "zod";

import { serializeUser } from "../lib/auth";
import { ensureDefaultCategories } from "../lib/defaultCategories";
import { jsonError } from "../lib/errors";
import { ensureDefaultServiceCategories, serializeBlockSchedules } from "../lib/filtering";
import { mailTestSend, sendMail } from "../lib/mail";
import { getPeriodId } from "../lib/period";
import { verifyPassword } from "../lib/password";
import { prisma } from "../lib/prisma";
import { requireAuth, type AuthContext } from "../middleware/auth";

const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email(),
  currentPassword: z.string().min(8).max(100).optional(),
  paydayOfMonth: z.number().int().min(1).max(31)
});

const completeSetupSchema = z.object({
  paydayOfMonth: z.number().int().min(1).max(31),
  initialAccount: z
    .object({
      name: z.string().trim().min(1).max(100),
      type: z.enum(["BANK", "CASH", "CREDIT"]),
      balance: z.number().int().min(0)
    })
    .optional(),
  goals: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(100),
        targetAmount: z.number().int().positive(),
        deadline: z.string().date().optional()
      })
    )
    .max(3)
    .default([])
});

const preferenceSchema = z.object({
  notificationsEnabled: z.boolean(),
  dailyReminder: z.boolean(),
  weeklySummary: z.boolean(),
  goalNotification: z.boolean(),
  deficitAlert: z.boolean()
});

const timeStringSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const blockScheduleSchema = z.object({
  categoryCode: z.enum(["EC", "PAYMENT"]),
  enabled: z.boolean(),
  days: z.array(z.number().int().min(0).max(6)).max(7),
  startTime: timeStringSchema,
  endTime: timeStringSchema
});

const blockSettingsSchema = z.object({
  warningNotificationEnabled: z.boolean(),
  webPushEnabled: z.boolean(),
  vpnConnectionEnabled: z.boolean(),
  caCertificateInstalled: z.boolean(),
  schedules: z.array(blockScheduleSchema).max(10)
});

export const usersRoutes = new Hono<AuthContext>();

usersRoutes.use("*", requireAuth);

usersRoutes.get("/me", async (c) => {
  const authUser = c.get("authUser");
  const user = await prisma.user.findUnique({
    where: { id: authUser.id }
  });

  if (!user) {
    return jsonError(c, "ログインが必要です", 401);
  }

  await ensureDefaultCategories(user.id);

  return c.json({
    data: {
      ...serializeUser(user),
      streakDays: user.streakDays
    }
  });
});

usersRoutes.get("/me/preferences", async (c) => {
  const authUser = c.get("authUser");
  try {
    const preference = await prisma.userPreference.findUnique({
      where: { userId: authUser.id }
    });

    return c.json({
      data: {
        notificationsEnabled: preference?.notificationsEnabled ?? true,
        dailyReminder: preference?.dailyReminder ?? true,
        weeklySummary: preference?.weeklySummary ?? false,
        goalNotification: preference?.goalNotification ?? true,
        deficitAlert: preference?.deficitAlert ?? false
      }
    });
  } catch (error) {
    console.error("preferences:get", error);
    return c.json({
      data: {
        notificationsEnabled: true,
        dailyReminder: true,
        weeklySummary: false,
        goalNotification: true,
        deficitAlert: false
      }
    });
  }
});

usersRoutes.put("/me/preferences", async (c) => {
  const authUser = c.get("authUser");
  const body = await c.req.json().catch(() => null);
  const parsed = preferenceSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "入力内容を確認してください", 400);
  }

  try {
    const preference = await prisma.userPreference.upsert({
      where: { userId: authUser.id },
      update: parsed.data,
      create: {
        userId: authUser.id,
        ...parsed.data
      }
    });

    return c.json({ data: preference });
  } catch (error) {
    console.error("preferences:put", error);
    return jsonError(c, "通知設定の保存準備がまだ完了していません。開発サーバーを再起動してください", 500);
  }
});

usersRoutes.get("/me/block-settings", async (c) => {
  const authUser = c.get("authUser");

  await ensureDefaultServiceCategories(prisma as never);

  const [setting, categories, schedules] = await Promise.all([
    prisma.userBlockSetting.findUnique({
      where: { userId: authUser.id }
    }),
    prisma.serviceCategory.findMany({
      orderBy: { sortOrder: "asc" },
      select: { code: true, name: true, sortOrder: true }
    }),
    prisma.userBlockSchedule.findMany({
      where: { userId: authUser.id },
      include: {
        category: {
          select: { code: true, name: true, sortOrder: true }
        }
      }
    })
  ]);

  return c.json({
    data: {
      warningNotificationEnabled: setting?.warningNotificationEnabled ?? true,
      webPushEnabled: setting?.webPushEnabled ?? false,
      vpnConnectionEnabled: setting?.vpnConnectionEnabled ?? false,
      caCertificateInstalled: setting?.caCertificateInstalled ?? false,
      schedules: serializeBlockSchedules(categories, schedules)
    }
  });
});

usersRoutes.put("/me/block-settings", async (c) => {
  const authUser = c.get("authUser");
  const body = await c.req.json().catch(() => null);
  const parsed = blockSettingsSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "入力内容を確認してください", 400);
  }

  if (parsed.data.schedules.some((schedule) => schedule.enabled && schedule.days.length === 0)) {
    return jsonError(c, "有効なスケジュールには曜日を1つ以上設定してください", 400);
  }

  await ensureDefaultServiceCategories(prisma as never);

  const categories = await prisma.serviceCategory.findMany({
    where: {
      code: {
        in: parsed.data.schedules.map((schedule) => schedule.categoryCode)
      }
    },
    select: { id: true, code: true, name: true, sortOrder: true }
  });

  const categoryMap = new Map(categories.map((category) => [category.code, category]));
  const scheduleRows = parsed.data.schedules.flatMap((schedule) => {
    const category = categoryMap.get(schedule.categoryCode);
    if (!category) {
      return [];
    }

    const days = [...new Set(schedule.days)].sort((left, right) => left - right);
    return days.map((dayOfWeek) => ({
      userId: authUser.id,
      categoryId: category.id,
      dayOfWeek,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      enabled: schedule.enabled
    }));
  });

  await prisma.$transaction(async (tx) => {
    await tx.userBlockSetting.upsert({
      where: { userId: authUser.id },
      update: {
        warningNotificationEnabled: parsed.data.warningNotificationEnabled,
        webPushEnabled: parsed.data.webPushEnabled,
        vpnConnectionEnabled: parsed.data.vpnConnectionEnabled,
        caCertificateInstalled: parsed.data.caCertificateInstalled
      },
      create: {
        userId: authUser.id,
        warningNotificationEnabled: parsed.data.warningNotificationEnabled,
        webPushEnabled: parsed.data.webPushEnabled,
        vpnConnectionEnabled: parsed.data.vpnConnectionEnabled,
        caCertificateInstalled: parsed.data.caCertificateInstalled
      }
    });

    await tx.userBlockSchedule.deleteMany({
      where: { userId: authUser.id }
    });

    if (scheduleRows.length > 0) {
      await tx.userBlockSchedule.createMany({
        data: scheduleRows
      });
    }
  });

  const savedSchedules = await prisma.userBlockSchedule.findMany({
    where: { userId: authUser.id },
    include: {
      category: {
        select: { code: true, name: true, sortOrder: true }
      }
    }
  });

  return c.json({
    data: {
      warningNotificationEnabled: parsed.data.warningNotificationEnabled,
      webPushEnabled: parsed.data.webPushEnabled,
      vpnConnectionEnabled: parsed.data.vpnConnectionEnabled,
      caCertificateInstalled: parsed.data.caCertificateInstalled,
      schedules: serializeBlockSchedules(categories, savedSchedules)
    }
  });
});

usersRoutes.put("/me", async (c) => {
  const authUser = c.get("authUser");
  const body = await c.req.json().catch(() => null);
  const parsed = updateProfileSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "入力内容を確認してください", 400);
  }

  const user = await prisma.user.findUnique({
    where: { id: authUser.id }
  });

  if (!user) {
    return jsonError(c, "ログインが必要です", 401);
  }

  if (parsed.data.email !== user.email) {
    if (!parsed.data.currentPassword) {
      return jsonError(c, "メール変更には現在のパスワードが必要です", 400);
    }

    const validPassword = await verifyPassword(parsed.data.currentPassword, user.passwordHash);

    if (!validPassword) {
      return jsonError(c, "現在のパスワードが違います", 400);
    }
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      paydayOfMonth: parsed.data.paydayOfMonth
    }
  });

  return c.json({
    data: serializeUser(updated)
  });
});

usersRoutes.post("/me/complete-setup", async (c) => {
  const authUser = c.get("authUser");
  const body = await c.req.json().catch(() => null);
  const parsed = completeSetupSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "入力内容を確認してください", 400);
  }

  const user = await prisma.user.findUnique({
    where: { id: authUser.id }
  });

  if (!user) {
    return jsonError(c, "ログインが必要です", 401);
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        paydayOfMonth: parsed.data.paydayOfMonth,
        setupCompleted: true
      }
    });

    if (parsed.data.initialAccount) {
      const existingPrimary = await tx.account.findFirst({
        where: { userId: user.id, isPrimary: true }
      });
      const sortOrder = (await tx.account.count({ where: { userId: user.id } })) + 1;

      await tx.account.create({
        data: {
          userId: user.id,
          name: parsed.data.initialAccount.name,
          type: parsed.data.initialAccount.type,
          balance: parsed.data.initialAccount.balance,
          isPrimary: existingPrimary ? false : true,
          sortOrder
        }
      });
    }

    for (const goal of parsed.data.goals) {
      await tx.goal.create({
        data: {
          userId: user.id,
          title: goal.title,
          targetAmount: goal.targetAmount,
          deadline: goal.deadline ? new Date(`${goal.deadline}T00:00:00.000Z`) : null,
          visualCategory: "OTHER",
          visualSubcategory: "generic",
          visualTheme: "SOFT",
          visualLocked: false
        }
      });
    }
  });

  await ensureDefaultCategories(user.id);

  return c.json({
    data: {
      success: true
    }
  });
});

usersRoutes.get("/me/stats", async (c) => {
  const authUser = c.get("authUser");
  const user = await prisma.user.findUnique({
    where: { id: authUser.id }
  });

  if (!user) {
    return jsonError(c, "ログインが必要です", 401);
  }

  const currentPeriodId = getPeriodId(new Date(), user.paydayOfMonth);
  const [records, savingTransfers] = await Promise.all([
    prisma.dailyRecord.findMany({
      where: {
        userId: user.id,
        periodId: currentPeriodId
      }
    }),
    prisma.accountTransfer.findMany({
      where: {
        userId: user.id,
        periodId: currentPeriodId,
        kind: "SAVING"
      }
    })
  ]);

  return c.json({
    data: {
      currentPeriodId,
      incomeTotal: records.filter((record) => record.type === "INCOME").reduce((sum, record) => sum + record.amount, 0),
      expenseTotal: records.filter((record) => record.type === "EXPENSE").reduce((sum, record) => sum + record.amount, 0),
      savingTotal:
        records.filter((record) => record.type === "SAVING").reduce((sum, record) => sum + record.amount, 0)
        + savingTransfers.reduce((sum, transfer) => sum + transfer.amount, 0),
      streakDays: user.streakDays
    }
  });
});

// ── メール受信ボックス ──────────────────────────────────────────────────

const INBOX_DOMAIN = process.env.INBOX_DOMAIN ?? "inbox.finance-pro.space";

function generateMailboxToken(): string {
  return randomBytes(10).toString("hex");
}

function tokenToAddress(token: string): string {
  return `${token}@${INBOX_DOMAIN}`;
}

// GET /me/mailbox — 受信ボックス情報（なければ自動作成）
usersRoutes.get("/me/mailbox", async (c) => {
  const authUser = c.get("authUser");

  let mailbox = await prisma.inboundMailbox.findUnique({ where: { userId: authUser.id } });

  if (!mailbox) {
    const token = generateMailboxToken();
    mailbox = await prisma.inboundMailbox.create({
      data: {
        userId: authUser.id,
        token,
        address: tokenToAddress(token),
        status: "ACTIVE"
      }
    });
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [receivedCount7d, candidateCount7d] = await Promise.all([
    prisma.inboundMessage.count({
      where: { mailboxId: mailbox.id, receivedAt: { gte: sevenDaysAgo } }
    }),
    prisma.actionCandidate.count({
      where: {
        userId: authUser.id,
        sourceType: "MAIL",
        createdAt: { gte: sevenDaysAgo }
      }
    })
  ]);

  return c.json({
    data: {
      address: mailbox.address,
      status: mailbox.status,
      receivedCount7d,
      candidateCount7d
    }
  });
});

// POST /me/mailbox/regenerate — アドレス再発行
usersRoutes.post("/me/mailbox/regenerate", async (c) => {
  const authUser = c.get("authUser");

  const token = generateMailboxToken();
  const address = tokenToAddress(token);

  const mailbox = await prisma.inboundMailbox.upsert({
    where: { userId: authUser.id },
    create: { userId: authUser.id, token, address, status: "ACTIVE" },
    update: { token, address }
  });

  return c.json({ data: { address: mailbox.address, status: mailbox.status } });
});

// POST /me/mailbox/test — テストメール送信
usersRoutes.post("/me/mailbox/test", async (c) => {
  const authUser = c.get("authUser");

  const mailbox = await prisma.inboundMailbox.findUnique({
    where: { userId: authUser.id }
  });

  if (!mailbox) {
    return jsonError(c, "メールボックスが設定されていません", 404);
  }

  const now = new Date();
  const emailContent = [
    `From: TameLog Test <noreply@${INBOX_DOMAIN}>`,
    `To: ${mailbox.address}`,
    `Subject: TameLog テスト ¥1,234 接続確認`,
    `Date: ${now.toUTCString()}`,
    `Message-ID: <test-${now.getTime()}@${INBOX_DOMAIN}>`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    `これは TameLog のメール受信テストです。`,
    `金額: ¥1,234`,
    `このメールが届いた場合、メール転送が正常に機能しています。`,
  ].join("\n");

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("sendmail", [
        "-i",
        "-f", `noreply@${INBOX_DOMAIN}`,
        mailbox.address
      ]);
      proc.stdin.write(emailContent);
      proc.stdin.end();
      const timer = setTimeout(() => reject(new Error("sendmail timeout")), 10000);
      proc.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`sendmail exited with code ${code}`));
      });
      proc.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
    return c.json({ data: { sent: true, to: mailbox.address } });
  } catch (err) {
    console.error("[MAILBOX TEST]", err);
    return jsonError(c, "テストメールの送信に失敗しました", 500);
  }
});

// POST /me/test-notification-mail — 通知メール送信テスト
usersRoutes.post("/me/test-notification-mail", async (c) => {
  const authUser = c.get("authUser");
  const user = await prisma.user.findUnique({ where: { id: authUser.id } });
  if (!user) return jsonError(c, "ユーザーが見つかりません", 404);

  try {
    await sendMail({ to: user.email, ...mailTestSend(user.name) });
    return c.json({ data: { sent: true, to: user.email } });
  } catch (err) {
    console.error("[TEST MAIL]", err);
    return jsonError(c, "メールの送信に失敗しました", 500);
  }
});

// ─── データリセット / アカウント削除 ────────────────────────────────────────

const RESET_TARGETS = [
  "records", "transfers", "accounts", "categories",
  "goals", "impulse", "notifications", "mailbox", "candidates"
] as const;
type ResetTarget = typeof RESET_TARGETS[number];

const resetSchema = z.object({
  targets: z.array(z.enum(RESET_TARGETS)).min(1),
  confirm: z.string()
});

// POST /me/reset — 選択したデータをリセット
usersRoutes.post("/me/reset", async (c) => {
  const authUser = c.get("authUser");
  const body = await c.req.json().catch(() => null);
  const parsed = resetSchema.safeParse(body);
  if (!parsed.success) return jsonError(c, "入力内容を確認してください", 400);
  if (parsed.data.confirm !== "リセット") return jsonError(c, "確認フレーズが正しくありません", 400);

  const uid = authUser.id;
  const t = parsed.data.targets as ResetTarget[];

  await prisma.$transaction(async (tx) => {
    if (t.includes("records")) {
      await tx.goalRecord.deleteMany({ where: { dailyRecord: { userId: uid } } });
      await tx.dailyRecord.deleteMany({ where: { userId: uid } });
    }
    if (t.includes("transfers")) {
      await tx.goalRecord.deleteMany({ where: { accountTransfer: { userId: uid } } });
      await tx.accountTransfer.deleteMany({ where: { userId: uid } });
    }
    if (t.includes("goals")) {
      await tx.goalRecord.deleteMany({ where: { goal: { userId: uid } } });
      await tx.goal.deleteMany({ where: { userId: uid } });
    }
    if (t.includes("accounts")) {
      // accounts 削除前に依存データを削除
      await tx.goalRecord.deleteMany({ where: { dailyRecord: { userId: uid } } });
      await tx.dailyRecord.deleteMany({ where: { userId: uid } });
      await tx.goalRecord.deleteMany({ where: { accountTransfer: { userId: uid } } });
      await tx.accountTransfer.deleteMany({ where: { userId: uid } });
      await tx.account.deleteMany({ where: { userId: uid } });
    }
    if (t.includes("categories")) {
      await tx.category.deleteMany({ where: { userId: uid } });
    }
    if (t.includes("impulse")) {
      await tx.impulseItem.deleteMany({ where: { userId: uid } });
    }
    if (t.includes("notifications")) {
      await tx.appNotification.deleteMany({ where: { userId: uid } });
    }
    if (t.includes("candidates")) {
      await tx.actionCandidate.deleteMany({ where: { userId: uid } });
    }
    if (t.includes("mailbox")) {
      const mailboxes = await tx.inboundMailbox.findMany({ where: { userId: uid }, select: { id: true } });
      const ids = mailboxes.map((m) => m.id);
      if (ids.length) {
        await tx.actionCandidate.deleteMany({ where: { inboxMessage: { mailboxId: { in: ids } } } });
        await tx.inboundMessage.deleteMany({ where: { mailboxId: { in: ids } } });
      }
    }
  });

  return c.json({ data: { success: true, targets: t } });
});

// DELETE /me — アカウント完全削除
usersRoutes.delete("/me", async (c) => {
  const authUser = c.get("authUser");
  const body = await c.req.json().catch(() => null) as { confirm?: string } | null;
  if (body?.confirm !== "アカウントを削除") return jsonError(c, "確認フレーズが正しくありません", 400);

  const uid = authUser.id;
  await prisma.$transaction(async (tx) => {
    await tx.goalRecord.deleteMany({ where: { dailyRecord: { userId: uid } } });
    await tx.goalRecord.deleteMany({ where: { accountTransfer: { userId: uid } } });
    await tx.dailyRecord.deleteMany({ where: { userId: uid } });
    await tx.accountTransfer.deleteMany({ where: { userId: uid } });
    await tx.goal.deleteMany({ where: { userId: uid } });
    await tx.account.deleteMany({ where: { userId: uid } });
    await tx.category.deleteMany({ where: { userId: uid } });
    await tx.impulseItem.deleteMany({ where: { userId: uid } });
    await tx.appNotification.deleteMany({ where: { userId: uid } });
    await tx.actionCandidate.deleteMany({ where: { userId: uid } });
    await tx.pushSubscription.deleteMany({ where: { userId: uid } });
    await tx.vpnClient.deleteMany({ where: { userId: uid } });
    await tx.userPreference.deleteMany({ where: { userId: uid } });
    await tx.userBlockSetting.deleteMany({ where: { userId: uid } });
    await tx.userBlockSchedule.deleteMany({ where: { userId: uid } });
    const mailboxes = await tx.inboundMailbox.findMany({ where: { userId: uid }, select: { id: true } });
    const ids = mailboxes.map((m) => m.id);
    if (ids.length) {
      await tx.inboundMessage.deleteMany({ where: { mailboxId: { in: ids } } });
      await tx.inboundMailbox.deleteMany({ where: { userId: uid } });
    }
    await tx.user.delete({ where: { id: uid } });
  });

  return c.json({ data: { success: true } });
});
