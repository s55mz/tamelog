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
  // Accept either "YYYY-MM" or full period ID "YYYY-MM-DD"
  month: z.string().min(7).max(10)
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
export const ocrRoutes = new Hono<AuthContext>();

chatRoutes.use("*", requireAuth);
analysisRoutes.use("*", requireAuth);
ocrRoutes.use("*", requireAuth);

ocrRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.imageBase64 || !body?.mimeType) {
    return jsonError(c, "imageBase64 と mimeType が必要です", 400);
  }

  const apiKey = await getApiKey();
  if (!apiKey) {
    return jsonError(c, "AIキーが設定されていません", 503);
  }

  // Categories passed from client for smart matching
  const categories: Array<{ id: string; name: string; type: string }> =
    Array.isArray(body.categories) ? body.categories : [];

  const expenseCategories = categories.filter((c) => c.type === "EXPENSE");
  const incomeCategories = categories.filter((c) => c.type === "INCOME");

  const categoryListText =
    expenseCategories.length > 0 || incomeCategories.length > 0
      ? `\n\nAvailable categories for matching (use exact id values):
EXPENSE categories: ${JSON.stringify(expenseCategories.map((c) => ({ id: c.id, name: c.name })))}
INCOME categories: ${JSON.stringify(incomeCategories.map((c) => ({ id: c.id, name: c.name })))}

Based on the receipt content, select the most appropriate categoryId from the list above.
For receipts/purchases, use EXPENSE categories. For salary slips or income documents, use INCOME categories.
If no category matches well, set categoryId to null.`
      : "";

  const prompt = `You are a receipt/invoice parser. Extract transaction data from this image and return ONLY a JSON object (no markdown, no explanation) with these fields:
- amount: number (total amount in JPY, integer, null if unclear)
- date: string or null (format: YYYY-MM-DD)
- time: string or null (format: HH:mm)
- vendor: string or null (store/vendor name in original language)
- type: string ("EXPENSE" for receipts/purchases, "INCOME" for salary/income documents)
- categoryId: string or null (select from provided category list below)${categoryListText}

Return ONLY the JSON object with no surrounding text.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:${body.mimeType};base64,${body.imageBase64}` }
              },
              { type: "text", text: prompt }
            ]
          }
        ],
        max_tokens: 400
      }),
      signal: AbortSignal.timeout(25000)
    });

    if (!response.ok) {
      return jsonError(c, "OCR処理に失敗しました", 503);
    }

    const result = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    const raw = result.choices[0]?.message?.content ?? "{}";

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as Record<string, unknown>;
    } catch {
      return jsonError(c, "OCR結果の解析に失敗しました", 500);
    }

    const returnedType = typeof parsed.type === "string" && ["INCOME", "EXPENSE"].includes(parsed.type as string)
      ? (parsed.type as "INCOME" | "EXPENSE")
      : "EXPENSE";

    // Validate categoryId exists AND matches the detected type (prevent INVALID_CATEGORY server error)
    const returnedCategoryId = typeof parsed.categoryId === "string" ? parsed.categoryId : null;
    const validCategoryId = returnedCategoryId &&
      categories.some((c) => c.id === returnedCategoryId && c.type === returnedType)
        ? returnedCategoryId
        : null;

    return c.json({
      data: {
        amount: typeof parsed.amount === "number" ? parsed.amount : null,
        date: typeof parsed.date === "string" ? parsed.date : null,
        time: typeof parsed.time === "string" ? parsed.time : null,
        vendor: typeof parsed.vendor === "string" ? parsed.vendor : null,
        type: returnedType,
        categoryId: validCategoryId
      }
    });
  } catch (err) {
    console.error("OCR error:", err);
    return jsonError(c, "OCR処理に失敗しました", 503);
  }
});

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
  // If client sent a full period ID (e.g. "2026-02-25"), use it directly.
  // If it's only "YYYY-MM", derive from the 1st of that month.
  const isFullPeriodId = /^\d{4}-\d{2}-\d{2}$/.test(parsed.data.month);
  const periodId = isFullPeriodId
    ? parsed.data.month
    : getPeriodId(new Date(`${parsed.data.month}-01T00:00:00.000Z`), user.paydayOfMonth);

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
    content = `## ${periodId} 家計レポート v${nextVersion}

### 収支サマリー
- 収入: ¥${incomeTotal.toLocaleString()}
- 支出: ¥${expenseTotal.toLocaleString()}（収入比 ${incomeTotal > 0 ? Math.round((expenseTotal / incomeTotal) * 100) : 0}%）
- 貯金: ¥${savingTotal.toLocaleString()}（貯蓄率 ${incomeTotal > 0 ? Math.round((savingTotal / incomeTotal) * 100) : 0}%）
- 収支: ¥${(incomeTotal - expenseTotal - savingTotal).toLocaleString()}

### 支出カテゴリ
${Object.entries(categoryTotals).length > 0
  ? Object.entries(categoryTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, amount]) => `- ${name}: ¥${amount.toLocaleString()}`)
      .join("\n")
  : "- 支出カテゴリの記録がありません"}

> AIレポートを利用するには、管理パネルからOpenAI APIキーを設定してください。`;
  } else {
    const prompt = `You are an expert personal finance advisor. Analyze the following financial data and generate a comprehensive monthly report in Japanese.

Financial Data (JSON):
${JSON.stringify(financialData, null, 2)}

Generate a detailed report with the following sections in Japanese. Do NOT use any emoji characters:
1. 収支サマリー - Overall income/expense/saving summary
2. 支出内訳 - Detailed expense category breakdown
3. 収支トレンド - Notable patterns and observations from the transaction data
4. 感情と消費の分析 - Analysis of spending patterns related to recorded emotions (if any)
5. 改善アドバイス - 3 specific, actionable recommendations
6. 財務健全度スコア - Score out of 5 with justification

Use Japanese yen formatting (¥X,XXX). Be specific with numbers. Format nicely with markdown headers (## and ###). Do not use emoji in any section.
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
