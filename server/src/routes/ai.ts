import { Hono } from "hono";
import { z } from "zod";

import { jsonError } from "../lib/errors";
import { getPeriodId } from "../lib/period";
import { prisma } from "../lib/prisma";
import { requireAuth, type AuthContext } from "../middleware/auth";

const chatSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string()
      })
    )
    .max(20)
    .default([])
});

const analysisSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/)
});

async function getApiKey(): Promise<string | null> {
  const config = await prisma.systemConfig.findUnique({ where: { id: "system" } });
  return config?.openaiApiKey ?? process.env.OPENAI_API_KEY ?? null;
}

async function callOpenAI(
  apiKey: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number = 2000
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.7,
      max_tokens: maxTokens
    })
  });

  if (!response.ok) {
    const err = await response.text().catch(() => "unknown");
    throw new Error(`OpenAI error: ${response.status} ${err}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0]?.message?.content ?? "";
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

  const user = await prisma.user.findUnique({ where: { id: authUser.id } });
  if (!user) {
    return jsonError(c, "ログインが必要です", 401);
  }

  const apiKey = await getApiKey();
  const currentPeriodId = getPeriodId(new Date(), user.paydayOfMonth);

  const [records, savingTransfers] = await Promise.all([
    prisma.dailyRecord.findMany({
      where: { userId: user.id, periodId: currentPeriodId },
      include: { category: { select: { name: true } } },
      orderBy: { recordDate: "desc" },
      take: 50
    }),
    prisma.accountTransfer.findMany({
      where: { userId: user.id, periodId: currentPeriodId, kind: "SAVING" }
    })
  ]);

  const incomeTotal = records
    .filter((r) => r.type === "INCOME")
    .reduce((s, r) => s + r.amount, 0);
  const expenseTotal = records
    .filter((r) => r.type === "EXPENSE")
    .reduce((s, r) => s + r.amount, 0);
  const savingTotal =
    records.filter((r) => r.type === "SAVING").reduce((s, r) => s + r.amount, 0) +
    savingTransfers.reduce((s, t) => s + t.amount, 0);

  const context = `Current period financial summary:
- Income: ¥${incomeTotal.toLocaleString()}
- Expenses: ¥${expenseTotal.toLocaleString()}
- Savings: ¥${savingTotal.toLocaleString()}
- Balance: ¥${(incomeTotal - expenseTotal - savingTotal).toLocaleString()}
Recent expense records (up to 20): ${JSON.stringify(
    records
      .filter((r) => r.type === "EXPENSE")
      .slice(0, 20)
      .map((r) => ({
        date: r.recordDate.toISOString().slice(0, 10),
        amount: r.amount,
        category: r.category?.name ?? "uncategorized",
        memo: r.memo ?? ""
      }))
  )}`;

  if (!apiKey) {
    return c.json({
      data: {
        reply: `今期の収入は${incomeTotal.toLocaleString()}円、支出は${expenseTotal.toLocaleString()}円、貯金は${savingTotal.toLocaleString()}円です。\n\n${parsed.data.message}については、まず支出の中から「なくてもよかった」ものを1件見つけることから始めてみましょう。小さな一歩が大きな変化につながります。`
      }
    });
  }

  const systemPrompt = `You are a friendly and insightful personal finance advisor for a Japanese user.
Always respond in natural Japanese. Be encouraging and specific with advice.
Keep responses concise (under 300 characters per message) but helpful.
Here is the user's current financial data: ${context}`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...parsed.data.history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: parsed.data.message }
  ];

  try {
    const reply = await callOpenAI(apiKey, messages, 600);
    return c.json({ data: { reply } });
  } catch (err) {
    console.error("OpenAI chat error:", err);
    return jsonError(c, "AI応答の取得に失敗しました。APIキーを確認してください", 503);
  }
});

analysisRoutes.get("/", async (c) => {
  const authUser = c.get("authUser");
  const month = c.req.query("month");

  if (!month) {
    return jsonError(c, "month を指定してください", 400);
  }

  const analyses = await prisma.aIAnalysis.findMany({
    where: { userId: authUser.id, targetMonth: month },
    orderBy: { version: "desc" }
  });

  return c.json({
    data: {
      analyses: analyses.map((a) => ({
        id: a.id,
        month: a.targetMonth,
        version: a.version,
        content: a.content,
        generatedAt: a.generatedAt.toISOString()
      })),
      generationCount: analyses.length
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

  const user = await prisma.user.findUnique({ where: { id: authUser.id } });
  if (!user) {
    return jsonError(c, "ログインが必要です", 401);
  }

  // Check monthly generation limit
  const existingAnalyses = await prisma.aIAnalysis.findMany({
    where: { userId: user.id, targetMonth: parsed.data.month },
    orderBy: { version: "desc" }
  });

  if (existingAnalyses.length >= 3) {
    return jsonError(c, "今月の生成上限（3回）に達しました", 429);
  }

  const nextVersion = (existingAnalyses[0]?.version ?? 0) + 1;
  const targetDate = new Date(`${parsed.data.month}-01T00:00:00.000Z`);
  const periodId = getPeriodId(targetDate, user.paydayOfMonth);

  const [records, savingTransfers, accounts] = await Promise.all([
    prisma.dailyRecord.findMany({
      where: { userId: user.id, periodId },
      include: {
        category: { select: { name: true } },
        goal: { select: { title: true } }
      },
      orderBy: { recordDate: "asc" }
    }),
    prisma.accountTransfer.findMany({
      where: { userId: user.id, periodId, kind: "SAVING" },
      include: { goal: { select: { title: true } } }
    }),
    prisma.account.findMany({
      where: { userId: user.id },
      select: { name: true, type: true, balance: true }
    })
  ]);

  const incomeTotal = records
    .filter((r) => r.type === "INCOME")
    .reduce((s, r) => s + r.amount, 0);
  const expenseTotal = records
    .filter((r) => r.type === "EXPENSE")
    .reduce((s, r) => s + r.amount, 0);
  const savingTotal =
    records.filter((r) => r.type === "SAVING").reduce((s, r) => s + r.amount, 0) +
    savingTransfers.reduce((s, t) => s + t.amount, 0);

  // Category breakdown
  const categoryTotals: Record<string, number> = {};
  for (const r of records) {
    if (r.type === "EXPENSE" && r.category) {
      categoryTotals[r.category.name] = (categoryTotals[r.category.name] ?? 0) + r.amount;
    }
  }

  const financialData = {
    period: parsed.data.month,
    summary: {
      income: incomeTotal,
      expense: expenseTotal,
      saving: savingTotal,
      balance: incomeTotal - expenseTotal - savingTotal,
      savingRate: incomeTotal > 0 ? Math.round((savingTotal / incomeTotal) * 100) : 0
    },
    accounts: accounts.map((a) => ({
      name: a.name,
      type: a.type,
      balance: a.balance
    })),
    categoryBreakdown: Object.entries(categoryTotals)
      .sort(([, a], [, b]) => b - a)
      .map(([name, amount]) => ({
        category: name,
        amount,
        percentage: expenseTotal > 0 ? Math.round((amount / expenseTotal) * 100) : 0
      })),
    transactions: records.map((r) => ({
      date: r.recordDate.toISOString().slice(0, 10),
      time: r.recordedAt.toISOString().slice(11, 16),
      type: r.type,
      amount: r.amount,
      category: r.category?.name ?? null,
      goal: r.goal?.title ?? null,
      memo: r.memo ?? null,
      emotions: r.emotions
    }))
  };

  const apiKey = await getApiKey();

  let content: string;

  if (!apiKey) {
    content = `## ${parsed.data.month} 家計レポート v${nextVersion}

### 📊 収支サマリー
- 収入: ¥${incomeTotal.toLocaleString()}
- 支出: ¥${expenseTotal.toLocaleString()}（収入比 ${incomeTotal > 0 ? Math.round((expenseTotal / incomeTotal) * 100) : 0}%）
- 貯金: ¥${savingTotal.toLocaleString()}（貯蓄率 ${incomeTotal > 0 ? Math.round((savingTotal / incomeTotal) * 100) : 0}%）
- 収支: ¥${(incomeTotal - expenseTotal - savingTotal).toLocaleString()}

### 💸 支出カテゴリ
${Object.entries(categoryTotals)
  .sort(([, a], [, b]) => b - a)
  .slice(0, 5)
  .map(([name, amount]) => `- ${name}: ¥${amount.toLocaleString()}`)
  .join("\n")}

> AIレポートを利用するには、管理パネルからOpenAI APIキーを設定してください。`;
  } else {
    const prompt = `You are an expert personal finance advisor. Analyze the following financial data and generate a comprehensive monthly report in Japanese.

Financial Data (JSON):
${JSON.stringify(financialData, null, 2)}

Generate a detailed report with the following sections in Japanese:
1. 📊 収支サマリー - Overall income/expense/saving summary with bar-chart representation using Unicode blocks (█)
2. 💸 支出内訳 - Detailed expense category breakdown with visual bars
3. 📈 収支トレンド - Notable patterns, peaks, and observations from the transaction data
4. 😊 感情と消費の分析 - Analysis of spending patterns related to recorded emotions (if any)
5. 🎯 改善アドバイス - 3 specific, actionable recommendations
6. ⭐ 財務健全度 - Score out of 5 stars with justification

Use Japanese yen formatting (¥X,XXX). Be specific with numbers. Format nicely with markdown.
Keep the report focused and insightful, around 600-800 characters total.`;

    try {
      content = await callOpenAI(apiKey, [{ role: "user", content: prompt }], 1500);
    } catch (err) {
      console.error("OpenAI analysis error:", err);
      return jsonError(c, "AI分析の生成に失敗しました。APIキーを確認してください", 503);
    }
  }

  const analysis = await prisma.aIAnalysis.create({
    data: {
      userId: user.id,
      targetMonth: parsed.data.month,
      periodId,
      version: nextVersion,
      content,
      generatedAt: new Date()
    }
  });

  return c.json({
    data: {
      analysis: {
        id: analysis.id,
        month: analysis.targetMonth,
        version: analysis.version,
        content: analysis.content,
        generatedAt: analysis.generatedAt.toISOString()
      },
      generationCount: existingAnalyses.length + 1
    }
  });
});
