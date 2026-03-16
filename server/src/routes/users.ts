import { Hono } from "hono";
import { z } from "zod";

import { serializeUser } from "../lib/auth";
import { ensureDefaultCategories } from "../lib/defaultCategories";
import { jsonError } from "../lib/errors";
import { ensureDefaultServiceCategories, serializeBlockSchedules } from "../lib/filtering";
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
