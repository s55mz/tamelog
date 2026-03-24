import cron from "node-cron";

import { getPeriodId } from "./period";
import { mailWeeklySummary, sendMail } from "./mail";
import { prisma } from "./prisma";

export function startCronJobs() {
  // 毎週土曜 21:00 JST (12:00 UTC) — 週次通知メール
  cron.schedule("0 12 * * 6", async () => {
    console.log("[CRON] 週次通知メール送信開始");
    try {
      const users = await prisma.user.findMany({
        where: { status: "ACTIVE", setupCompleted: true },
        include: { preference: true }
      });

      for (const user of users) {
        const pref = user.preference;
        if (!pref) continue;

        // 週次まとめ・目標・赤字アラートのどれかが有効な場合のみ送信
        if (!pref.weeklySummary && !pref.goalNotification && !pref.deficitAlert) continue;

        const periodId = getPeriodId(new Date(), user.paydayOfMonth);
        const [incomeAgg, expenseAgg, savingAgg, goals] = await Promise.all([
          prisma.dailyRecord.aggregate({ where: { userId: user.id, periodId, type: "INCOME" }, _sum: { amount: true } }),
          prisma.dailyRecord.aggregate({ where: { userId: user.id, periodId, type: "EXPENSE" }, _sum: { amount: true } }),
          prisma.dailyRecord.aggregate({ where: { userId: user.id, periodId, type: "SAVING" }, _sum: { amount: true } }),
          prisma.goal.findMany({ where: { userId: user.id, isArchived: false }, include: { goalRecords: { select: { amount: true } } } })
        ]);

        const incomeTotal = Number(incomeAgg._sum.amount ?? 0);
        const expenseTotal = Number(expenseAgg._sum.amount ?? 0);
        const savingTotal = Number(savingAgg._sum.amount ?? 0);
        const balance = incomeTotal - expenseTotal;

        const topGoal = goals.length > 0 ? goals.reduce((best, g) => {
          const rate = g.goalRecords.reduce((s, r) => s + r.amount, 0);
          const bRate = best.goalRecords.reduce((s, r) => s + r.amount, 0);
          return rate > bRate ? g : best;
        }, goals[0]) : null;

        const topGoalRate = topGoal
          ? Math.round(topGoal.goalRecords.reduce((s, r) => s + r.amount, 0) / topGoal.targetAmount * 100)
          : null;

        const mail = mailWeeklySummary({
          userName: user.name,
          incomeTotal,
          expenseTotal,
          savingTotal,
          balance,
          goalCount: goals.length,
          topGoalName: topGoal?.title ?? null,
          topGoalRate,
          weeklyReminderEnabled: pref.weeklySummary,
          goalNotificationEnabled: pref.goalNotification,
          deficitAlertEnabled: pref.deficitAlert
        });

        if (mail) {
          await sendMail({ to: user.email, ...mail }).catch((err: unknown) =>
            console.error(`[CRON] 週次メール失敗 ${user.email}:`, err)
          );
        }
      }
      console.log(`[CRON] 週次通知メール完了: ${users.length}ユーザー処理`);
    } catch (err) {
      console.error("[CRON] 週次通知エラー:", err);
    }
  }, { timezone: "Asia/Tokyo" });

  console.log("[CRON] ジョブ登録完了: 週次通知（毎週土曜21:00）");
}
