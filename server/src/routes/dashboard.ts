import { Hono } from "hono";

import { serializeGoal, getFocusedGoalScore } from "../lib/goals";
import { getPeriodId } from "../lib/period";
import { prisma } from "../lib/prisma";
import { requireAuth, type AuthContext } from "../middleware/auth";
import { jsonError } from "../lib/errors";

export const dashboardRoutes = new Hono<AuthContext>();

dashboardRoutes.use("*", requireAuth);

dashboardRoutes.get("/", async (c) => {
  const authUser = c.get("authUser");
  const user = await prisma.user.findUnique({
    where: { id: authUser.id }
  });

  if (!user) {
    return jsonError(c, "ログインが必要です", 401);
  }

  const currentPeriodId = getPeriodId(new Date(), user.paydayOfMonth);
  const [goals, recentRecords, recentTransfers, currentPeriodRecords, currentPeriodSavingTransfers, todayRecords] = await Promise.all([
    prisma.goal.findMany({
      where: { userId: user.id, isArchived: false },
      include: { goalRecords: { select: { amount: true } } }
    }),
    prisma.dailyRecord.findMany({
      where: { userId: user.id },
      include: {
        account: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        goal: { select: { id: true, title: true } }
      },
      orderBy: [{ recordDate: "desc" }, { createdAt: "desc" }],
      take: 5
    }),
    prisma.accountTransfer.findMany({
      where: { userId: user.id },
      include: {
        fromAccount: { select: { id: true, name: true } },
        toAccount: { select: { id: true, name: true } },
        goal: { select: { id: true, title: true } }
      },
      orderBy: [{ recordDate: "desc" }, { createdAt: "desc" }],
      take: 5
    }),
    prisma.dailyRecord.findMany({
      where: { userId: user.id, periodId: currentPeriodId }
    }),
    prisma.accountTransfer.findMany({
      where: { userId: user.id, periodId: currentPeriodId, kind: "SAVING" }
    }),
    prisma.dailyRecord.count({
      where: {
        userId: user.id,
        recordDate: {
          gte: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`),
          lte: new Date(`${new Date().toISOString().slice(0, 10)}T23:59:59.999Z`)
        }
      }
    })
  ]);

  const focusedGoalBase = [...goals].sort((left, right) => {
    const scoreDiff = getFocusedGoalScore(right) - getFocusedGoalScore(left);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    const leftSerialized = serializeGoal(left);
    const rightSerialized = serializeGoal(right);
    return rightSerialized.achievementRate - leftSerialized.achievementRate;
  })[0];

  const focusedGoal = focusedGoalBase
    ? {
        ...serializeGoal(focusedGoalBase),
        score: Number(getFocusedGoalScore(focusedGoalBase).toFixed(2))
      }
    : null;

  const savingTotal = currentPeriodRecords
    .filter((record) => record.type === "SAVING")
    .reduce((sum, record) => sum + record.amount, 0)
    + currentPeriodSavingTransfers.reduce((sum, transfer) => sum + transfer.amount, 0);

  const recentActivity = [
    ...recentRecords.map((record) => ({
      id: `record-${record.id}`,
      type: record.type,
      amount: record.amount,
      memo: record.memo,
      recordDate: record.recordDate.toISOString().slice(0, 10)
    })),
    ...recentTransfers.map((transfer) => ({
      id: `transfer-${transfer.id}`,
      type: transfer.kind === "SAVING" ? "SAVING_MOVE" : "TRANSFER",
      amount: transfer.amount,
      memo: transfer.memo,
      recordDate: transfer.recordDate.toISOString().slice(0, 10)
    }))
  ]
    .sort((left, right) => right.recordDate.localeCompare(left.recordDate))
    .slice(0, 5);

  const mission =
    todayRecords === 0
      ? {
          type: "record_today",
          message: "今日の記録をつけると、目標にまた近づけます"
        }
      : {
          type: "keep_going",
          message: "今日も積み上がっています。この調子で続けましょう"
        };

  return c.json({
    data: {
      greeting: "おかえりなさい",
      focusedGoal,
      savingSummary: {
        currentPeriodId,
        savingTotal
      },
      mission,
      recentRecords: recentActivity
    }
  });
});
