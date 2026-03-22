import { Hono } from "hono";

import { jsonError } from "../lib/errors";
import { getPeriodId } from "../lib/period";
import { prisma } from "../lib/prisma";
import { requireAuth, type AuthContext } from "../middleware/auth";

export const csvRoutes = new Hono<AuthContext>();

async function getOpenAIKey(): Promise<string | null> {
  const config = await prisma.systemConfig.findUnique({ where: { id: "system" } });
  return config?.openaiApiKey ?? process.env.OPENAI_API_KEY ?? null;
}

// ── Export CSV ──────────────────────────────────────────
csvRoutes.get("/export", requireAuth, async (c) => {
  const authUser = c.get("authUser");
  const records = await prisma.dailyRecord.findMany({
    where: { userId: authUser.id },
    include: { category: true, account: true, goal: true },
    orderBy: { recordDate: "desc" }
  });

  const header = "日付,種別,金額,取引先,カテゴリ,口座,貯金先";
  const rows = records.map((r) => [
    r.recordDate instanceof Date ? r.recordDate.toISOString().slice(0, 10) : String(r.recordDate).slice(0, 10),
    r.type,
    r.amount,
    (r.memo ?? "").replace(/,/g, "、"),
    r.category?.name ?? "",
    r.account?.name ?? "",
    r.goal?.title ?? ""
  ].join(","));

  const csv = [header, ...rows].join("\n");

  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="tamelog-export-${new Date().toISOString().slice(0, 10)}.csv"`);
  return c.body("\uFEFF" + csv); // BOM for Excel
});

// ── Import CSV ──────────────────────────────────────────
csvRoutes.post("/import", requireAuth, async (c) => {
  const authUser = c.get("authUser");

  // Fetch full user to get paydayOfMonth
  const user = await prisma.user.findUnique({ where: { id: authUser.id } });
  if (!user) return jsonError(c, "ユーザーが見つかりません", 404);

  const body = await c.req.json().catch(() => null) as { csvText?: string; format?: string } | null;
  if (!body?.csvText) return jsonError(c, "CSVデータが必要です", 400);

  // Get user's accounts, categories, and goals
  const [accounts, categories, goals] = await Promise.all([
    prisma.account.findMany({ where: { userId: authUser.id } }),
    prisma.category.findMany({ where: { userId: authUser.id } }),
    prisma.goal.findMany({ where: { userId: authUser.id } })
  ]);

  if (!accounts.length) return jsonError(c, "先に口座を登録してください", 400);

  const defaultAccount = accounts.find((a) => a.isPrimary) ?? accounts[0];

  type ImportRow = {
    date: string;
    type: string;
    amount: number;
    memo: string;
    categoryId: string | null;
    accountId: string;
    goalId: string | null;
  };

  let rows: ImportRow[] = [];
  const lines = body.csvText.trim().split("\n").filter((l) => l.trim());

  // Try direct parse (standard TameLog format: 日付,種別,金額,取引先,カテゴリ,口座[,貯金先])
  const dataLines = lines.slice(1); // skip header
  const parsed: ImportRow[] = dataLines
    .map((line) => {
      const parts = line.split(",");
      const [date, type, amountStr, memo, categoryName, accountName, goalName] = parts;
      const account = accounts.find((a) => a.name === accountName) ?? defaultAccount;
      const category = categories.find((cat) => cat.name === categoryName) ?? null;
      const goal = goalName ? (goals.find((g) => g.title === goalName.trim()) ?? null) : null;
      const validType = ["INCOME", "EXPENSE", "SAVING"].includes(type ?? "") ? type : "EXPENSE";
      return {
        date: date ?? new Date().toISOString().slice(0, 10),
        type: validType,
        amount: Math.abs(Number(amountStr) || 0),
        memo: memo ?? "",
        categoryId: category?.id ?? null,
        accountId: account.id,
        goalId: goal?.id ?? null
      } as ImportRow;
    })
    .filter((r) => r.amount > 0);

  if (parsed.length > 0) {
    rows = parsed;
  } else {
    // Try AI-powered parsing for non-standard formats
    const apiKey = await getOpenAIKey();
    if (!apiKey) return jsonError(c, "非標準CSVはAI機能が必要です。先に口座登録してください。", 400);

    const prompt = `以下のCSVデータを家計簿データに変換してください。
利用可能な口座: ${accounts.map((a) => `${a.id}:${a.name}`).join(", ")}
利用可能なカテゴリ: ${categories.map((cat) => `${cat.id}:${cat.name}(${cat.type})`).join(", ")}
デフォルト口座ID: ${defaultAccount.id}

CSVデータ:
${lines.slice(0, 50).join("\n")}

以下のJSON形式で返してください（コードブロック不要）:
{"records":[{"date":"YYYY-MM-DD","type":"INCOME|EXPENSE|SAVING","amount":数値,"memo":"メモ","categoryId":"カテゴリID or null","accountId":"口座ID"}]}
金額は正の数値にしてください。日付形式はYYYY-MM-DDにしてください。`;

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 2000,
          response_format: { type: "json_object" }
        })
      });
      if (!response.ok) return jsonError(c, "AI解析に失敗しました", 500);
      type OpenAIResponse = { choices: Array<{ message: { content: string } }> };
      const json = await response.json() as OpenAIResponse;
      const content = json.choices[0]?.message?.content ?? "{}";
      type ParsedResult = { records?: ImportRow[] } | ImportRow[];
      const parsedAI = JSON.parse(content) as ParsedResult;
      rows = Array.isArray(parsedAI) ? parsedAI : ((parsedAI as { records?: ImportRow[] }).records ?? []);
    } catch {
      return jsonError(c, "AI解析に失敗しました", 500);
    }
  }

  // Validate and insert
  const validRows = rows.filter((r) => r.amount > 0 && r.date && r.accountId);
  if (!validRows.length) return jsonError(c, "インポート可能なデータがありません", 400);

  let imported = 0;
  for (const row of validRows.slice(0, 500)) {
    try {
      const recordDate = new Date(row.date);
      const periodId = getPeriodId(recordDate, user.paydayOfMonth ?? 25);
      await prisma.dailyRecord.create({
        data: {
          userId: authUser.id,
          accountId: row.accountId,
          categoryId: row.categoryId ?? null,
          goalId: row.type === "SAVING" ? (row.goalId ?? null) : null,
          type: row.type as "INCOME" | "EXPENSE" | "SAVING",
          amount: row.amount,
          memo: row.memo || null,
          recordDate,
          recordedAt: recordDate,
          periodId
        }
      });
      imported++;
    } catch {
      // skip invalid rows
    }
  }

  return c.json({ data: { imported, total: validRows.length } });
});
