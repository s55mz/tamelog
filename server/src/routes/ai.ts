import { Hono } from "hono";
import { z } from "zod";

import { jsonError } from "../lib/errors";
import { getPeriodId } from "../lib/period";
import { prisma } from "../lib/prisma";
import { requireAuth, type AuthContext } from "../middleware/auth";

const chatSchema = z.object({
  message: z.string().trim().min(1).max(1000)
});

const analysisSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/)
});

function buildChatReply(message: string, expenseTotal: number, savingTotal: number) {
  if (process.env.OPENAI_API_KEY) {
    return "OpenAI 連携は今後ここに接続します。";
  }

  return `今期の支出は ${expenseTotal} 円、貯金は ${savingTotal} 円です。焦って一気に変えるより、今日 1 件だけ支出を見直すのが現実的です。${message} については、小さく続けられる工夫を優先しましょう。`;
}

export const chatRoutes = new Hono<AuthContext>();
export const analysisRoutes = new Hono<AuthContext>();

chatRoutes.use("*", requireAuth);
analysisRoutes.use("*", requireAuth);

chatRoutes.post("/", async (c) => {
  const authUser = c.get("authUser");
  const body = await c.req.json().catch(() => null);
  const parsed = chatSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "入力内容を確認してください", 400);
  }

  const user = await prisma.user.findUnique({
    where: { id: authUser.id }
  });

  if (!user) {
    return jsonError(c, "ログインが必要です", 401);
  }

  const currentPeriodId = getPeriodId(new Date(), user.paydayOfMonth);
  const [records, savingTransfers] = await Promise.all([
    prisma.dailyRecord.findMany({
      where: { userId: user.id, periodId: currentPeriodId }
    }),
    prisma.accountTransfer.findMany({
      where: { userId: user.id, periodId: currentPeriodId, kind: "SAVING" }
    })
  ]);

  const savingTotal =
    records.filter((record) => record.type === "SAVING").reduce((sum, record) => sum + record.amount, 0)
    + savingTransfers.reduce((sum, transfer) => sum + transfer.amount, 0);
  const expenseTotal = records.filter((record) => record.type === "EXPENSE").reduce((sum, record) => sum + record.amount, 0);

  return c.json({
    data: {
      reply: buildChatReply(parsed.data.message, expenseTotal, savingTotal)
    }
  });
});

analysisRoutes.get("/", async (c) => {
  const authUser = c.get("authUser");
  const month = c.req.query("month");

  if (!month) {
    return jsonError(c, "month を指定してください", 400);
  }

  const analysis = await prisma.aIAnalysis.findUnique({
    where: {
      userId_targetMonth: {
        userId: authUser.id,
        targetMonth: month
      }
    }
  });

  return c.json({
    data: {
      analysis: analysis
        ? {
            id: analysis.id,
            month: analysis.targetMonth,
            content: analysis.content,
            generatedAt: analysis.generatedAt.toISOString()
          }
        : null
    }
  });
});

analysisRoutes.post("/generate", async (c) => {
  const authUser = c.get("authUser");
  const body = await c.req.json().catch(() => null);
  const parsed = analysisSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "入力内容を確認してください", 400);
  }

  const user = await prisma.user.findUnique({
    where: { id: authUser.id }
  });

  if (!user) {
    return jsonError(c, "ログインが必要です", 401);
  }

  const targetDate = new Date(`${parsed.data.month}-01T00:00:00.000Z`);
  const periodId = getPeriodId(targetDate, user.paydayOfMonth);
  const [records, savingTransfers] = await Promise.all([
    prisma.dailyRecord.findMany({
      where: {
        userId: user.id,
        periodId
      }
    }),
    prisma.accountTransfer.findMany({
      where: {
        userId: user.id,
        periodId,
        kind: "SAVING"
      }
    })
  ]);

  const incomeTotal = records.filter((record) => record.type === "INCOME").reduce((sum, record) => sum + record.amount, 0);
  const expenseTotal = records.filter((record) => record.type === "EXPENSE").reduce((sum, record) => sum + record.amount, 0);
  const savingTotal =
    records.filter((record) => record.type === "SAVING").reduce((sum, record) => sum + record.amount, 0)
    + savingTransfers.reduce((sum, transfer) => sum + transfer.amount, 0);

  const content = process.env.OPENAI_API_KEY
    ? "OpenAI 連携は今後ここに接続します。"
    : `${parsed.data.month} のまとめです。収入は ${incomeTotal} 円、支出は ${expenseTotal} 円、貯金は ${savingTotal} 円でした。支出の流れを見ながら、次の期間で減らせる項目を 1 つだけ選ぶのが現実的です。`;

  const analysis = await prisma.aIAnalysis.upsert({
    where: {
      userId_targetMonth: {
        userId: user.id,
        targetMonth: parsed.data.month
      }
    },
    update: {
      periodId,
      content,
      generatedAt: new Date()
    },
    create: {
      userId: user.id,
      targetMonth: parsed.data.month,
      periodId,
      content,
      generatedAt: new Date()
    }
  });

  return c.json({
    data: {
      analysis: {
        id: analysis.id,
        month: analysis.targetMonth,
        content: analysis.content,
        generatedAt: analysis.generatedAt.toISOString()
      }
    }
  });
});
