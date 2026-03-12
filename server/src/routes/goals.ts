import { Hono } from "hono";
import { z } from "zod";

import { jsonError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { requireAuth, type AuthContext } from "../middleware/auth";

const createGoalSchema = z.object({
  title: z.string().trim().min(1).max(100),
  targetAmount: z.number().int().positive(),
  deadline: z.string().date().optional(),
  note: z.string().trim().max(500).optional(),
  visualTheme: z.enum(["SOFT", "POP", "CALM"]).default("SOFT")
});

function serializeGoal(goal: {
  id: string;
  title: string;
  targetAmount: number;
  deadline: Date | null;
  visualCategory: string;
  visualSubcategory: string;
  visualTheme: string;
  visualLocked: boolean;
}) {
  return {
    id: goal.id,
    title: goal.title,
    targetAmount: goal.targetAmount,
    currentAmount: 0,
    achievementRate: 0,
    deadline: goal.deadline ? goal.deadline.toISOString().slice(0, 10) : null,
    remainingAmount: goal.targetAmount,
    remainingDays: null,
    visual: {
      category: goal.visualCategory,
      subcategory: goal.visualSubcategory,
      theme: goal.visualTheme,
      step: 1,
      imagePath: "/goal-assets/default_generic_step1.png",
      completeImagePath: "/goal-assets/default_generic_complete.png",
      altText: "目標の進捗イラスト",
      headlineText: "目標に向けて少しずつ進んでいます"
    },
    visualCategory: goal.visualCategory,
    visualSubcategory: goal.visualSubcategory,
    visualTheme: goal.visualTheme,
    visualLocked: goal.visualLocked
  };
}

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
      goals: goals.map((goal) => {
        const currentAmount = goal.goalRecords.reduce((sum, item) => sum + item.amount, 0);
        const base = serializeGoal(goal);

        return {
          ...base,
          currentAmount,
          achievementRate: goal.targetAmount > 0 ? Math.floor((currentAmount / goal.targetAmount) * 100) : 0,
          remainingAmount: Math.max(goal.targetAmount - currentAmount, 0)
        };
      })
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
