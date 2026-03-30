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

  // 毎日 03:00 JST (18:00 UTC) — VPN DNSドメインのAI分類
  cron.schedule("0 18 * * *", classifyVpnDomains, { timezone: "Asia/Tokyo" });

  console.log("[CRON] ジョブ登録完了: 週次通知（毎週土曜21:00）、DNS分類（毎日03:00）");
}

// ─── VPN DNSドメイン AI分類 ───────────────────────────────────────────────────

const DNS_CATEGORIES = ["EC", "PAYMENT", "SNS", "VIDEO", "NEWS", "GAME", "FINANCE", "NOISE", "OTHER"] as const;
type DnsCategory = (typeof DNS_CATEGORIES)[number];

// ユーザーが意識して使うサービスかどうか判断できるカテゴリ
const BLOCKABLE_CATEGORIES = new Set<DnsCategory>(["EC", "PAYMENT", "SNS", "VIDEO", "GAME", "FINANCE"]);

async function getOpenAIKey(): Promise<string | null> {
  const config = await prisma.systemConfig.findUnique({ where: { id: "system" } });
  return config?.openaiApiKey ?? process.env.OPENAI_API_KEY ?? null;
}

export async function classifyVpnDomains() {
  console.log("[CRON] DNS分類開始");

  const apiKey = await getOpenAIKey();
  if (!apiKey) {
    console.log("[CRON] OpenAI APIキー未設定、スキップ");
    return;
  }

  // 未分類 かつ queryCount >= 2 のドメインを取得（サブドメインは既にルートドメインに正規化済み）
  type RawRow = { domain: string };
  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT DISTINCT domain
    FROM "VpnDnsLog"
    WHERE category IS NULL AND "queryCount" >= 2
    ORDER BY domain
    LIMIT 200
  `;

  if (rows.length === 0) {
    console.log("[CRON] 未分類ドメインなし");
    return;
  }

  const domains = rows.map((r) => r.domain);
  console.log(`[CRON] 分類対象: ${domains.length}件`);

  // 50件ずつバッチ処理
  const BATCH = 50;
  for (let i = 0; i < domains.length; i += BATCH) {
    const batch = domains.slice(i, i + BATCH);
    await classifyBatch(apiKey, batch);
  }

  console.log("[CRON] DNS分類完了");
}

async function classifyBatch(apiKey: string, domains: string[]) {
  const prompt = `以下のドメインをカテゴリ分類してください。
サブドメインはすでに除去済みです（例: shop.example.com → example.com）。

カテゴリ一覧:
- EC: ショッピング・通販サイト（Amazon, 楽天, メルカリ等）
- PAYMENT: 決済・送金・後払い（PayPay, メルペイ, Paidy等）
- SNS: SNS・コミュニティ（Twitter/X, Instagram, TikTok等）
- VIDEO: 動画配信（Netflix, YouTube, Hulu等）
- NEWS: ニュース・メディア・ブログ
- GAME: ゲーム関連
- FINANCE: 銀行・証券・保険（楽天銀行、住信SBI等）
- NOISE: SDK・広告・分析・CDN・バックグラウンド通信（ユーザーが意識しないもの）
- OTHER: 上記以外のユーザー向けサービス

ルール:
- 同じ会社のサービスでも、ユーザーが直接アクセスするならNOISE以外に分類する
- analytics, sdk, cdn, ad, tracking, crash, metrics, telemetry 等が含まれるドメインはNOISE
- 判断できない場合はOTHER

ドメイン:
${domains.join(", ")}

JSON形式のみで返答してください（説明不要）:
{"domain.com": "CATEGORY", ...}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_tokens: 800,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) throw new Error(`OpenAI ${response.status}`);

    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    const raw = data.choices[0]?.message?.content ?? "{}";
    const result = JSON.parse(raw) as Record<string, string>;

    const now = new Date();

    // カテゴリ→ServiceCategory IDのマッピングを取得
    type CatRow = { id: string; code: string };
    const serviceCategories = await prisma.$queryRaw<CatRow[]>`SELECT id, code::text FROM "ServiceCategory"`;
    const catIdMap = new Map(serviceCategories.map((sc) => [sc.code, sc.id]));

    // EC/PAYMENTはブロック対象カテゴリ（FINANCEは銀行なので除外）
    const AUTO_BLOCK_CATEGORIES = new Map<string, string>([
      ["EC", "EC"],
      ["PAYMENT", "PAYMENT"],
    ]);

    for (const [domain, cat] of Object.entries(result)) {
      const category = DNS_CATEGORIES.includes(cat as DnsCategory) ? cat : "OTHER";

      // VpnDnsLogにカテゴリを保存
      await prisma.$executeRaw`
        UPDATE "VpnDnsLog"
        SET category = ${category}, "classifiedAt" = ${now}
        WHERE domain = ${domain} AND category IS NULL
      `;

      // EC/PAYMENTならServiceDomainに自動追加（ブロック対象に）
      const serviceCatCode = AUTO_BLOCK_CATEGORIES.get(category);
      if (serviceCatCode) {
        const categoryId = catIdMap.get(serviceCatCode);
        if (categoryId) {
          await prisma.$executeRaw`
            INSERT INTO "ServiceDomain" (id, "categoryId", domain, enabled, "createdAt", "updatedAt")
            VALUES (gen_random_uuid()::text, ${categoryId}, ${domain}, true, ${now}, ${now})
            ON CONFLICT ("categoryId", domain) DO NOTHING
          `;
          console.log(`[CRON] 自動ブロック追加: ${domain} → ${serviceCatCode}`);
        }
      }
    }

    console.log(`[CRON] バッチ分類完了: ${Object.keys(result).length}件`);
  } catch (err) {
    console.error("[CRON] DNS分類エラー:", err);
  }
}
