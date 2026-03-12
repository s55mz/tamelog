import { Hono } from "hono";
import { z } from "zod";

import { jsonError } from "../lib/errors";
import { serializeGoal } from "../lib/goals";
import { prisma } from "../lib/prisma";
import { requireAuth, type AuthContext } from "../middleware/auth";

const createGoalSchema = z.object({
  title: z.string().trim().min(1).max(100),
  targetAmount: z.number().int().positive(),
  deadline: z.string().date().optional(),
  note: z.string().trim().max(500).optional(),
  visualTheme: z.enum(["SOFT", "POP", "CALM"]).default("SOFT")
});

const updateGoalSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  targetAmount: z.number().int().positive().optional(),
  deadline: z.string().date().nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  visualTheme: z.enum(["SOFT", "POP", "CALM"]).optional()
});

export const goalsRoutes = new Hono<AuthContext>();

goalsRoutes.use("*", requireAuth);

goalsRoutes.get("/", async (c) => {
  const authUser = c.get("authUser");
  const goals = await prisma.goal.findMany({
    where: { userId: authUser.id, isArchived: false },
    include: {
      goalRecords: {
        select: {
          amount: true
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  return c.json({
    data: {
      goals: goals.map(serializeGoal)
    }
  });
});

goalsRoutes.post("/", async (c) => {
  const authUser = c.get("authUser");
  const body = await c.req.json().catch(() => null);
  const parsed = createGoalSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "入力内容を確認してください", 400);
  }

  const goal = await prisma.goal.create({
    data: {
      userId: authUser.id,
      title: parsed.data.title,
      targetAmount: parsed.data.targetAmount,
      deadline: parsed.data.deadline ? new Date(`${parsed.data.deadline}T00:00:00.000Z`) : null,
      note: parsed.data.note,
      visualCategory: "OTHER",
      visualSubcategory: "generic",
      visualTheme: parsed.data.visualTheme,
      visualLocked: false
    }
  });

  return c.json(
    {
      data: {
        goal: {
          id: goal.id,
          title: goal.title,
          visualCategory: goal.visualCategory,
          visualSubcategory: goal.visualSubcategory,
          visualTheme: goal.visualTheme,
          visualLocked: goal.visualLocked
        },
        classification: {
          source: "fallback",
          confidence: 0
        }
      }
    },
    201
  );
});

goalsRoutes.get("/:id/records", async (c) => {
  const authUser = c.get("authUser");
  const goal = await prisma.goal.findFirst({
    where: { id: c.req.param("id"), userId: authUser.id },
    select: { id: true, title: true }
  });

  if (!goal) {
    return jsonError(c, "目標が見つかりません", 404);
  }

  const records = await prisma.goalRecord.findMany({
    where: { goalId: goal.id },
    orderBy: [{ recordDate: "desc" }, { createdAt: "desc" }]
  });

  return c.json({
    data: {
      goal,
      records: records.map((record) => ({
        id: record.id,
        amount: record.amount,
        recordDate: record.recordDate.toISOString().slice(0, 10),
        periodId: record.periodId
      }))
    }
  });
});

goalsRoutes.put("/:id", async (c) => {
  const authUser = c.get("authUser");
  const body = await c.req.json().catch(() => null);
  const parsed = updateGoalSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "入力内容を確認してください", 400);
  }

  const existing = await prisma.goal.findFirst({
    where: { id: c.req.param("id"), userId: authUser.id }
  });

  if (!existing) {
    return jsonError(c, "目標が見つかりません", 404);
  }

  const goal = await prisma.goal.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.title ? { title: parsed.data.title } : {}),
      ...(parsed.data.targetAmount ? { targetAmount: parsed.data.targetAmount } : {}),
      ...(parsed.data.deadline !== undefined
        ? {
            deadline: parsed.data.deadline
              ? new Date(`${parsed.data.deadline}T00:00:00.000Z`)
              : null
          }
        : {}),
      ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
      ...(parsed.data.visualTheme ? { visualTheme: parsed.data.visualTheme } : {})
    },
    include: {
      goalRecords: { select: { amount: true } }
    }
  });

  return c.json({
    data: {
      goal: serializeGoal(goal)
    }
  });
});

goalsRoutes.delete("/:id", async (c) => {
  const authUser = c.get("authUser");
  const existing = await prisma.goal.findFirst({
    where: { id: c.req.param("id"), userId: authUser.id }
  });

  if (!existing) {
    return jsonError(c, "目標が見つかりません", 404);
  }

  await prisma.goal.delete({
    where: { id: existing.id }
  });

  return c.json({
    data: {
      success: true
    }
  });
});
