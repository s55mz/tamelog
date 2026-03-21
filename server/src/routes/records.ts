import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";

import { jsonError } from "../lib/errors";
import { getPeriodId } from "../lib/period";
import { prisma } from "../lib/prisma";
import {
  ensureOwnedAccount,
  ensureOwnedCategory,
  ensureOwnedGoal,
  getAccountBalanceDelta
} from "../lib/records";
import { requireAuth, type AuthContext } from "../middleware/auth";

const recordSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE", "SAVING"]),
  accountId: z.string().min(1),
  categoryId: z.string().nullable().optional(),
  goalId: z.string().nullable().optional(),
  amount: z.number().int().positive(),
  memo: z.string().trim().max(500).optional().nullable(),
  recordDate: z.string().date(),
  emotions: z.array(z.string().max(50)).max(10).default([]),
  recordedAt: z.string().datetime({ offset: true }).optional().nullable()
});

type RecordErrorCode =
  | "ACCOUNT_NOT_FOUND"
  | "GOAL_NOT_FOUND"
  | "RECORD_NOT_FOUND"
  | "INVALID_CATEGORY"
  | "INVALID_GOAL_TYPE";

function fail(code: RecordErrorCode): never {
  throw new Error(code);
}

function handleRecordError(c: Context, error: unknown) {
  if (!(error instanceof Error)) {
    return jsonError(c, "想定外のエラーが発生しました", 500);
  }

  if (error.message === "ACCOUNT_NOT_FOUND") {
    return jsonError(c, "口座が見つかりません", 404);
  }

  if (error.message === "GOAL_NOT_FOUND") {
    return jsonError(c, "目標が見つかりません", 404);
  }

  if (error.message === "RECORD_NOT_FOUND") {
    return jsonError(c, "記録が見つかりません", 404);
  }

  if (error.message === "INVALID_CATEGORY") {
    return jsonError(c, "カテゴリを確認してください", 400);
  }

  if (error.message === "INVALID_GOAL_TYPE") {
    return jsonError(c, "目標は貯金記録でのみ指定できます", 400);
  }

  return jsonError(c, "想定外のエラーが発生しました", 500);
}

function serializeRecord(record: {
  id: string;
  type: string;
  amount: number;
  memo: string | null;
  emotions: string[];
  recordDate: Date;
  recordedAt: Date;
  periodId: string;
  account: { id: string; name: string };
  category: { id: string; name: string } | null;
  goal: { id: string; title: string } | null;
}) {
  return {
    id: record.id,
    type: record.type,
    amount: record.amount,
    memo: record.memo,
    emotions: record.emotions,
    recordDate: record.recordDate.toISOString().slice(0, 10),
    recordedAt: record.recordedAt.toISOString(),
    periodId: record.periodId,
    account: record.account,
    category: record.category,
    goal: record.goal
  };
}

export const recordsRoutes = new Hono<AuthContext>();

recordsRoutes.use("*", requireAuth);

recordsRoutes.get("/periods", async (c) => {
  const authUser = c.get("authUser");

  const user = await prisma.user.findUnique({ where: { id: authUser.id } });
  if (!user) return jsonError(c, "ユーザーが見つかりません", 404);

  const [recordPeriods, transferPeriods] = await Promise.all([
    prisma.dailyRecord.findMany({
      where: { userId: authUser.id },
      select: { periodId: true },
      distinct: ["periodId"]
    }),
    prisma.accountTransfer.findMany({
      where: { userId: authUser.id },
      select: { periodId: true },
      distinct: ["periodId"]
    })
  ]);

  const currentPeriodId = getPeriodId(new Date(), user.paydayOfMonth);

  const allPeriodIds = [
    ...new Set([
      currentPeriodId,
      ...recordPeriods.map((r) => r.periodId),
      ...transferPeriods.map((t) => t.periodId)
    ])
  ].sort((a, b) => b.localeCompare(a));

  const periods = allPeriodIds.map((id) => {
    const [year, month, day] = id.split("-").map(Number);
    const endMonth = month === 12 ? 1 : month + 1;
    const endDay = day - 1;
    return { id, label: `${year}年${month}月${day}日〜${endMonth}月${endDay}日` };
  });

  return c.json({ data: { periods } });
});

recordsRoutes.get("/", async (c) => {
  const authUser = c.get("authUser");
  const page = Number(c.req.query("page") ?? "1");
  const limit = Number(c.req.query("limit") ?? "20");
  const periodId = c.req.query("periodId");
  const type = c.req.query("type");
  const accountId = c.req.query("accountId");
  const categoryId = c.req.query("categoryId");
  const dateFrom = c.req.query("dateFrom");
  const dateTo = c.req.query("dateTo");
  const allRecords = c.req.query("all") === "true";

  const where = {
    userId: authUser.id,
    ...(periodId ? { periodId } : {}),
    ...(type ? { type: type as "INCOME" | "EXPENSE" | "SAVING" } : {}),
    ...(accountId ? { accountId } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...((dateFrom || dateTo)
      ? {
          recordDate: {
            ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00.000Z`) } : {}),
            ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999Z`) } : {})
          }
        }
      : {})
  };

  const [total, records, aggregates] = await Promise.all([
    prisma.dailyRecord.count({ where }),
    prisma.dailyRecord.findMany({
      where,
      include: {
        account: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        goal: { select: { id: true, title: true } }
      },
      orderBy: [{ recordDate: "desc" }, { createdAt: "desc" }],
      ...(allRecords ? {} : { skip: (page - 1) * limit, take: limit })
    }),
    prisma.dailyRecord.groupBy({
      by: ["type"],
      where,
      _sum: { amount: true }
    })
  ]);

  return c.json({
    data: {
      records: records.map(serializeRecord),
      summary: {
        incomeTotal: aggregates.find((item) => item.type === "INCOME")?._sum.amount ?? 0,
        expenseTotal: aggregates.find((item) => item.type === "EXPENSE")?._sum.amount ?? 0,
        savingTotal: aggregates.find((item) => item.type === "SAVING")?._sum.amount ?? 0
      },
      pagination: {
        page,
        pageSize: limit,
        total
      }
    }
  });
});

recordsRoutes.post("/", async (c) => {
  const authUser = c.get("authUser");
  const body = await c.req.json().catch(() => null);
  const parsed = recordSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "入力内容を確認してください", 400);
  }

  const user = await prisma.user.findUnique({ where: { id: authUser.id } });
  if (!user) {
    return jsonError(c, "ログインが必要です", 401);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const account = await ensureOwnedAccount(tx, user.id, parsed.data.accountId);
      if (!account) {
        fail("ACCOUNT_NOT_FOUND");
      }

      if (parsed.data.goalId && parsed.data.type !== "SAVING") {
        fail("INVALID_GOAL_TYPE");
      }

      if (parsed.data.categoryId) {
        const category = await ensureOwnedCategory(tx, user.id, parsed.data.categoryId);
        if (!category || category.type !== parsed.data.type) {
          fail("INVALID_CATEGORY");
        }
      }

      if (parsed.data.goalId) {
        const goal = await ensureOwnedGoal(tx, user.id, parsed.data.goalId);
        if (!goal) {
          fail("GOAL_NOT_FOUND");
        }
      }

      const periodId = getPeriodId(parsed.data.recordDate, user.paydayOfMonth);
      const recordedAt = parsed.data.recordedAt ? new Date(parsed.data.recordedAt) : new Date();

      const record = await tx.dailyRecord.create({
        data: {
          userId: user.id,
          accountId: parsed.data.accountId,
          categoryId: parsed.data.categoryId ?? null,
          goalId: parsed.data.goalId ?? null,
          type: parsed.data.type,
          amount: parsed.data.amount,
          memo: parsed.data.memo ?? null,
          emotions: parsed.data.emotions,
          recordDate: new Date(`${parsed.data.recordDate}T00:00:00.000Z`),
          recordedAt,
          periodId
        }
      });

      const updatedAccount = await tx.account.update({
        where: { id: account.id },
        data: {
          balance: {
            increment: getAccountBalanceDelta(parsed.data.type, parsed.data.amount)
          }
        }
      });

      if (parsed.data.type === "SAVING" && parsed.data.goalId) {
        await tx.goalRecord.create({
          data: {
            goalId: parsed.data.goalId,
            dailyRecordId: record.id,
            amount: parsed.data.amount,
            recordDate: new Date(`${parsed.data.recordDate}T00:00:00.000Z`),
            periodId
          }
        });
      }

      return { record, account: updatedAccount };
    });

    return c.json(
      {
        data: {
          record: {
            id: result.record.id,
            type: result.record.type,
            amount: result.record.amount,
            periodId: result.record.periodId
          },
          account: {
            id: result.account.id,
            balance: result.account.balance
          }
        }
      },
      201
    );
  } catch (error) {
    return handleRecordError(c, error);
  }
});

recordsRoutes.put("/:id", async (c) => {
  const authUser = c.get("authUser");
  const body = await c.req.json().catch(() => null);
  const parsed = recordSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "入力内容を確認してください", 400);
  }

  const user = await prisma.user.findUnique({ where: { id: authUser.id } });
  if (!user) {
    return jsonError(c, "ログインが必要です", 401);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.dailyRecord.findFirst({
        where: { id: c.req.param("id"), userId: user.id }
      });

      if (!existing) {
        fail("RECORD_NOT_FOUND");
      }

      const nextAccount = await ensureOwnedAccount(tx, user.id, parsed.data.accountId);
      if (!nextAccount) {
        fail("ACCOUNT_NOT_FOUND");
      }

      if (parsed.data.categoryId) {
        const category = await ensureOwnedCategory(tx, user.id, parsed.data.categoryId);
        if (!category || category.type !== parsed.data.type) {
          fail("INVALID_CATEGORY");
        }
      }

      if (parsed.data.goalId && parsed.data.type !== "SAVING") {
        fail("INVALID_GOAL_TYPE");
      }

      if (parsed.data.goalId) {
        const goal = await ensureOwnedGoal(tx, user.id, parsed.data.goalId);
        if (!goal) {
          fail("GOAL_NOT_FOUND");
        }
      }

      await tx.account.update({
        where: { id: existing.accountId },
        data: {
          balance: {
            increment: -getAccountBalanceDelta(existing.type, existing.amount)
          }
        }
      });

      await tx.goalRecord.deleteMany({
        where: { dailyRecordId: existing.id }
      });

      const nextPeriodId = getPeriodId(parsed.data.recordDate, user.paydayOfMonth);
      const recordedAt = parsed.data.recordedAt ? new Date(parsed.data.recordedAt) : existing.recordedAt;

      const updatedRecord = await tx.dailyRecord.update({
        where: { id: existing.id },
        data: {
          accountId: parsed.data.accountId,
          categoryId: parsed.data.categoryId ?? null,
          goalId: parsed.data.goalId ?? null,
          type: parsed.data.type,
          amount: parsed.data.amount,
          memo: parsed.data.memo ?? null,
          emotions: parsed.data.emotions,
          recordDate: new Date(`${parsed.data.recordDate}T00:00:00.000Z`),
          recordedAt,
          periodId: nextPeriodId
        }
      });

      const updatedAccount = await tx.account.update({
        where: { id: parsed.data.accountId },
        data: {
          balance: {
            increment: getAccountBalanceDelta(parsed.data.type, parsed.data.amount)
          }
        }
      });

      if (parsed.data.type === "SAVING" && parsed.data.goalId) {
        await tx.goalRecord.create({
          data: {
            goalId: parsed.data.goalId,
            dailyRecordId: updatedRecord.id,
            amount: parsed.data.amount,
            recordDate: new Date(`${parsed.data.recordDate}T00:00:00.000Z`),
            periodId: nextPeriodId
          }
        });
      }

      return { record: updatedRecord, account: updatedAccount };
    });

    return c.json({
      data: {
        record: {
          id: result.record.id,
          type: result.record.type,
          amount: result.record.amount,
          periodId: result.record.periodId
        },
        account: {
          id: result.account.id,
          balance: result.account.balance
        }
      }
    });
  } catch (error) {
    return handleRecordError(c, error);
  }
});

recordsRoutes.delete("/:id", async (c) => {
  const authUser = c.get("authUser");

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.dailyRecord.findFirst({
        where: { id: c.req.param("id"), userId: authUser.id }
      });

      if (!existing) {
        fail("RECORD_NOT_FOUND");
      }

      await tx.account.update({
        where: { id: existing.accountId },
        data: {
          balance: {
            increment: -getAccountBalanceDelta(existing.type, existing.amount)
          }
        }
      });

      await tx.goalRecord.deleteMany({
        where: { dailyRecordId: existing.id }
      });

      await tx.dailyRecord.delete({
        where: { id: existing.id }
      });
    });

    return c.json({
      data: {
        success: true
      }
    });
  } catch (error) {
    return handleRecordError(c, error);
  }
});
