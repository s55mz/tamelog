import { Hono } from "hono";

import { getPeriodId } from "../lib/period";
import { prisma } from "../lib/prisma";
import { sendPushToUser } from "../lib/sendPush";

const INGEST_SECRET = process.env.INGEST_SECRET ?? "tamelog-ingest-secret";

// ─── AI parse result type ──────────────────────────────────────────────────────

type AiParseResult = {
  isTransaction: boolean;
  transactionDate: string | null;
  amount: number | null;
  candidateType: "EXPENSE" | "INCOME" | "TRANSFER" | "SAVING";
  title: string;
  merchant: string | null;
  memo: string | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  needsUserInput: boolean;
  categoryName: string | null;
  comment: string | null;
};

// ─── MIME / Header helpers ─────────────────────────────────────────────────────

/** charset 正規化（TextDecoder のラベルに合わせる） */
function normalizeCharset(cs: string): string {
  const c = cs.trim().toLowerCase();
  if (!c || c === "utf-8" || c === "utf8") return "utf-8";
  if (c === "iso-2022-jp" || c === "iso2022jp") return "iso-2022-jp";
  if (c === "shift_jis" || c === "shift-jis" || c === "sjis" || c === "x-sjis" || c === "windows-31j" || c === "cp932") return "shift_jis";
  if (c === "euc-jp" || c === "eucjp" || c === "x-euc-jp") return "euc-jp";
  return cs.trim();
}

/** 文字化けしているか判定 */
function isGarbled(text: string): boolean {
  const replacements = (text.match(/\uFFFD/g) ?? []).length;
  if (replacements > 2) return true;
  // ISO-2022-JPのエスケープシーケンスが未処理で残っている
  const escapeSeqs = (text.match(/\x1b\$[B@]|\x1b\([BJH]/g) ?? []).length;
  if (escapeSeqs > 0) return true;
  // 制御文字が多い
  const controlChars = (text.match(/[\x00-\x08\x0e-\x1f]/g) ?? []).length;
  if (controlChars > 3) return true;
  return false;
}

/** TextDecoder でBufferをデコード（失敗時はnull） */
function tryDecode(buf: Buffer, charset: string): string | null {
  try {
    const dec = new TextDecoder(charset, { fatal: true });
    return dec.decode(buf);
  } catch {
    return null;
  }
}

/** Bufferを複数文字コードで試してデコード（文字化け自動修復） */
function decodeBufferWithRepair(buf: Buffer, hint?: string): string {
  const candidates = hint
    ? [normalizeCharset(hint), "iso-2022-jp", "shift_jis", "euc-jp", "utf-8"]
    : ["utf-8", "iso-2022-jp", "shift_jis", "euc-jp"];

  for (const enc of candidates) {
    const decoded = tryDecode(buf, enc);
    if (decoded !== null && !isGarbled(decoded)) return decoded;
  }
  // どれでもダメならUTF-8フォールバック（置換文字許容）
  return new TextDecoder("utf-8").decode(buf);
}

/** RFC 2047 デコード: =?charset?B/Q?...?= → 文字列（charset考慮） */
function decodeRfc2047(str: string): string {
  return str
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (full, charset: string, enc: string, encoded: string) => {
      try {
        const cs = normalizeCharset(charset);
        if (enc.toUpperCase() === "B") {
          const buf = Buffer.from(encoded, "base64");
          return decodeBufferWithRepair(buf, cs);
        } else {
          // Q encoding → バイト列を集めてiconvでデコード
          const qDecoded = encoded.replace(/_/g, " ");
          const bytes: number[] = [];
          let i = 0;
          while (i < qDecoded.length) {
            if (qDecoded[i] === "=" && i + 2 < qDecoded.length) {
              bytes.push(parseInt(qDecoded.slice(i + 1, i + 3), 16));
              i += 3;
            } else {
              bytes.push(qDecoded.charCodeAt(i));
              i++;
            }
          }
          const buf = Buffer.from(bytes);
          return decodeBufferWithRepair(buf, cs);
        }
      } catch {
        return full;
      }
    })
    .replace(/\?= =\?[^?]+\?[BbQq]\?/g, ""); // 連続エンコードの空白除去
}

/** Quoted-Printable をバイト列にデコード */
function decodeQPToBuffer(str: string): Buffer {
  const cleaned = str.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  let i = 0;
  while (i < cleaned.length) {
    if (cleaned[i] === "=" && i + 2 < cleaned.length) {
      bytes.push(parseInt(cleaned.slice(i + 1, i + 3), 16));
      i += 3;
    } else {
      bytes.push(cleaned.charCodeAt(i));
      i++;
    }
  }
  return Buffer.from(bytes);
}

/** メールヘッダーをパース (key → value) */
function parseHeaders(raw: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const lines = raw.split(/\r?\n/);
  let key = "";

  for (const line of lines) {
    if (!line) break;
    if (/^\s/.test(line) && key) {
      headers[key] = (headers[key] ?? "") + " " + line.trim();
    } else {
      const m = line.match(/^([^:]+):\s*(.*)/);
      if (m) {
        key = m[1].toLowerCase();
        headers[key] = m[2];
      }
    }
  }
  return headers;
}

/** ヘッダーとボディに分割 */
function splitHeadersBody(raw: string): { headers: string; body: string } {
  const idx = raw.search(/\r?\n\r?\n/);
  if (idx < 0) return { headers: raw, body: "" };
  const nlLen = raw[idx + 1] === "\n" ? 2 : (raw[idx + 1] === "\r" ? 4 : 2);
  return { headers: raw.slice(0, idx), body: raw.slice(idx + nlLen) };
}

/** Content-Transfer-Encoding + charset に応じてデコード（文字化け修復付き） */
function decodeBody(body: string, cte: string, charset?: string): string {
  const enc = cte.trim().toLowerCase();
  if (enc === "base64") {
    try {
      const buf = Buffer.from(body.replace(/\s/g, ""), "base64");
      return decodeBufferWithRepair(buf, charset);
    } catch {
      return body;
    }
  }
  if (enc === "quoted-printable") {
    const buf = decodeQPToBuffer(body);
    const decoded = decodeBufferWithRepair(buf, charset);
    // 文字化けしていたら修復を試みる
    if (isGarbled(decoded)) {
      return decodeBufferWithRepair(buf);
    }
    return decoded;
  }
  // 7bit/8bit: そのままだが文字化け検知して修復
  if (charset) {
    try {
      const buf = Buffer.from(body, "binary");
      const decoded = decodeBufferWithRepair(buf, charset);
      if (!isGarbled(decoded)) return decoded;
    } catch { /* fall through */ }
  }
  return body;
}

/** Content-Type から charset を抽出 */
function extractCharset(contentType: string): string | undefined {
  const m = contentType.match(/charset="?([^";\s]+)"?/i);
  return m ? m[1] : undefined;
}

/** MIME multipart から text/plain を抽出 */
function extractFromMultipart(raw: string, boundary: string): string {
  const escaped = boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = raw.split(new RegExp(`--${escaped}`));

  for (const part of parts) {
    const { headers: partHdr, body: partBody } = splitHeadersBody(part.trim());
    const hMap = parseHeaders(partHdr + "\n");
    const ct = hMap["content-type"] ?? "";
    if (!ct.toLowerCase().includes("text/plain")) continue;

    const cte = hMap["content-transfer-encoding"] ?? "";
    const charset = extractCharset(ct);
    return decodeBody(partBody.trim(), cte, charset).slice(0, 3000);
  }
  return "";
}

/** メールからテキスト本文を抽出（MIME対応） */
function extractTextBody(raw: string): string {
  const { headers: hdrSection, body } = splitHeadersBody(raw);
  const hMap = parseHeaders(hdrSection + "\n");

  const ct = hMap["content-type"] ?? "";
  const cte = hMap["content-transfer-encoding"] ?? "";
  const charset = extractCharset(ct);

  if (ct.toLowerCase().includes("multipart")) {
    const bm = ct.match(/boundary="?([^";\r\n]+)"?/i);
    if (bm) return extractFromMultipart(raw, bm[1].trim());
  }

  return decodeBody(body.trim(), cte, charset).slice(0, 3000);
}

// ─── AI helpers ───────────────────────────────────────────────────────────────

async function parseWithAI(
  apiKey: string,
  subject: string,
  fromAddress: string,
  bodyText: string,
  budgetCtx: { income: number; expense: number; balance: number }
): Promise<AiParseResult | null> {
  const budgetLine = `今期の収入 ¥${budgetCtx.income.toLocaleString()} / 支出 ¥${budgetCtx.expense.toLocaleString()} / 収支 ¥${budgetCtx.balance.toLocaleString()}`;

  const prompt = `以下はメールアドレスに届いたメールです。
家計簿アプリ向けに解析し、JSONで返してください。

差出人: ${fromAddress}
件名: ${subject}
本文（先頭1500字）:
${bodyText.slice(0, 1500)}

【ユーザーの今期家計状況】
${budgetLine}

以下のJSON形式で返してください（コードブロック不要、JSONのみ）:
{
  "isTransaction": true | false,
  "transactionDate": "YYYY-MM-DD形式の取引日または null（本文に明記されていない場合）",
  "amount": 数値または null（金額が不明な場合）,
  "candidateType": "EXPENSE" | "INCOME" | "TRANSFER" | "SAVING",
  "title": "簡潔なタイトル（最大40文字）",
  "merchant": "店舗・サービス名または null",
  "memo": "補足メモまたは null",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "needsUserInput": true | false,
  "categoryName": "カテゴリ名または null（食費/交通費/外食/日用品/娯楽/医療/通信費/給与/副収入 など）",
  "comment": "家計状況を踏まえた短いコメント（1〜2文、タメ口OK、絵文字可）"
}

isTransaction 判断基準（最重要）:
- true: 実際の入出金・引落・利用・決済・振込・入金の通知
- false: テスト送信・転送設定確認・認証コード・案内・サービス登録確認・広告・パスワードリセット等
  ※ 「テスト」「確認」「ご登録」「認証」「案内」「お知らせ」のみで金額が一切ない場合は false

candidateType 判断基準（isTransaction=trueの場合のみ意味を持つ）:
- 引落・利用・購入 → EXPENSE
- 入金・給与・振込受取 → INCOME
- 口座間移動 → TRANSFER
- 積立・貯金 → SAVING
- 金額が明確に記載されている → confidence HIGH
- 金額が曖昧または不明 → needsUserInput true
- comment は家計状況に合わせてポジティブ/注意を促す一言（例: 支出多めなら「今月ちょっと使いすぎかも😅」、入金なら「お給料日！貯金に回してみて💪」）`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 300
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) throw new Error(`OpenAI ${response.status}`);

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const text = data.choices[0]?.message?.content?.trim() ?? "";
    const json = JSON.parse(text) as AiParseResult;

    if (typeof json.isTransaction !== "boolean") json.isTransaction = true;
    if (typeof json.transactionDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(json.transactionDate)) json.transactionDate = null;
    if (!["EXPENSE", "INCOME", "TRANSFER", "SAVING"].includes(json.candidateType)) json.candidateType = "EXPENSE";
    if (!["HIGH", "MEDIUM", "LOW"].includes(json.confidence)) json.confidence = "MEDIUM";
    if (json.amount !== null && (typeof json.amount !== "number" || json.amount <= 0)) json.amount = null;

    return json;
  } catch (err) {
    console.error("[INGEST] AI parse failed:", err);
    return null;
  }
}

// ─── 金融関連メール判定 ──────────────────────────────────────────────────────────

const FINANCIAL_KEYWORDS = [
  "引落", "利用", "入金", "出金", "振込", "振替", "決済", "請求", "支払", "支払い",
  "クレジット", "デビット", "ご利用", "ご請求",
  "ご入金", "ご出金", "ご振込", "チャージ", "ポイント付与", "明細", "引き落とし",
  "口座振替", "残高不足", "ご入金確認",
  "payment", "transaction", "charge", "transfer", "deposit", "withdrawal",
  "invoice", "receipt", "purchase", "¥", "￥"
];

function isFinancialEmail(subject: string, body: string): boolean {
  const text = subject + " " + body;
  return FINANCIAL_KEYWORDS.some((kw) => text.includes(kw));
}

// ─── Fallback ─────────────────────────────────────────────────────────────────

function extractAmountFallback(text: string): number | null {
  const patterns = [/[¥￥]\s*([\d,]+)/, /([\d,]+)\s*円/, /(\d+)\s*JPY/i];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const n = parseInt(m[1].replace(/,/g, ""), 10);
      if (!isNaN(n) && n > 0 && n < 10_000_000) return n;
    }
  }
  return null;
}

// ─── Route ────────────────────────────────────────────────────────────────────

const app = new Hono();

app.post("/mail", async (c) => {
  const secret = c.req.header("X-Ingest-Secret");
  if (secret !== INGEST_SECRET) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json().catch(() => null);
  if (!body?.raw || !body?.recipient) return c.json({ error: "raw and recipient are required" }, 400);

  const { raw, recipient } = body as { raw: string; recipient: string };

  const atIdx = recipient.lastIndexOf("@");
  const token = atIdx >= 0 ? recipient.slice(0, atIdx) : recipient;

  const mailbox = await prisma.inboundMailbox.findFirst({ where: { token, status: "ACTIVE" } });
  if (!mailbox) {
    console.log(`[INGEST] No active mailbox for token: ${token}`);
    return c.json({ skipped: true });
  }

  // ヘッダーパース（RFC 2047 デコード済み）
  const { headers: rawHeaders } = splitHeadersBody(raw);
  const hMap = parseHeaders(rawHeaders + "\n");

  const subject = decodeRfc2047(hMap["subject"] ?? "(件名なし)").trim();
  const fromAddress = decodeRfc2047(hMap["from"] ?? "").trim();
  const messageId = hMap["message-id"]?.replace(/[<>]/g, "") ?? null;
  const dateStr = hMap["date"] ?? null;
  const receivedAt = dateStr ? new Date(dateStr) : new Date();

  // ── ループ防止: アプリ自身が送信したメールをスキップ ──
  const appDomain = process.env.MAIL_DOMAIN ?? "finance-pro.space";
  const isSelfGenerated =
    hMap["x-tamelog-generated"] === "1" ||
    subject.startsWith("【TameLog】") ||
    fromAddress.includes(`no-reply@${appDomain}`) ||
    fromAddress.includes(`noreply@${appDomain}`);

  if (isSelfGenerated) {
    console.log(`[INGEST] Skipped self-generated email: "${subject}" from ${fromAddress}`);
    return c.json({ skipped: true, reason: "self_generated" });
  }

  // 重複チェック
  if (messageId) {
    const exists = await prisma.inboundMessage.findFirst({ where: { messageId } });
    if (exists) return c.json({ duplicate: true });
  }

  // 本文デコード
  const rawText = extractTextBody(raw);

  // 全メールを受信ボックスに保存（認証コード等も保存）
  const isFinancial = isFinancialEmail(subject, rawText);

  const message = await prisma.inboundMessage.create({
    data: {
      mailboxId: mailbox.id,
      sourceType: "MAIL",
      fromAddress,
      subject,
      messageId,
      rawText: rawText || null,
      receivedAt,
      parseStatus: "RECEIVED"
    }
  });

  // 金融関連でない場合は候補作成せず受信ボックスのみに保存
  if (!isFinancial) {
    console.log(`[INGEST] Saved non-financial email (no candidate): "${subject}" from ${fromAddress}`);
    await prisma.inboundMessage.update({ where: { id: message.id }, data: { parseStatus: "DUPLICATE" } });
    return c.json({ saved: true, candidate: false });
  }

  // 今期家計状況を取得（AI コメント用）
  const userRecord = await prisma.user.findUnique({ where: { id: mailbox.userId }, select: { paydayOfMonth: true } });
  const periodId = getPeriodId(new Date(), userRecord?.paydayOfMonth ?? 1);
  const [incomeAgg, expenseAgg] = await Promise.all([
    prisma.dailyRecord.aggregate({ where: { userId: mailbox.userId, periodId, type: "INCOME" }, _sum: { amount: true } }),
    prisma.dailyRecord.aggregate({ where: { userId: mailbox.userId, periodId, type: "EXPENSE" }, _sum: { amount: true } })
  ]);
  const budgetIncome = Number(incomeAgg._sum.amount ?? 0);
  const budgetExpense = Number(expenseAgg._sum.amount ?? 0);
  const budgetCtx = { income: budgetIncome, expense: budgetExpense, balance: budgetIncome - budgetExpense };

  // AI 解析
  const sysConfig = await prisma.systemConfig.findUnique({ where: { id: "system" } });
  const apiKey = sysConfig?.openaiApiKey ?? process.env.OPENAI_API_KEY ?? null;

  let aiResult: AiParseResult | null = null;
  if (apiKey) aiResult = await parseWithAI(apiKey, subject, fromAddress, rawText, budgetCtx);

  // AIが「取引ではない」と判定した場合は候補作成せず終了
  if (aiResult && !aiResult.isTransaction) {
    console.log(`[INGEST] AI classified as non-transaction: "${subject}" from ${fromAddress}`);
    await prisma.inboundMessage.update({ where: { id: message.id }, data: { parseStatus: "DUPLICATE", parsedJson: aiResult as any } });
    return c.json({ saved: true, candidate: false, reason: "not_transaction" });
  }

  const fromMatch = fromAddress.match(/<([^>]+)>/);
  const fallbackMerchant = fromMatch ? fromMatch[1] : fromAddress || null;

  const candidateData = aiResult
    ? {
        candidateType: aiResult.candidateType as any,
        confidence: aiResult.confidence as any,
        amount: aiResult.amount ?? null,
        title: aiResult.title.slice(0, 200),
        merchantRaw: aiResult.merchant ?? fallbackMerchant,
        memoDraft: aiResult.memo ?? null,
        needsUserInput: aiResult.needsUserInput || aiResult.amount === null,
        aiSummary: aiResult.comment ?? aiResult.memo ?? null,
        aiExtractedJson: aiResult as any
      }
    : {
        candidateType: "EXPENSE" as any,
        confidence: "LOW" as any,
        amount: extractAmountFallback(subject + " " + rawText),
        title: subject.slice(0, 200),
        merchantRaw: fallbackMerchant,
        memoDraft: null,
        needsUserInput: true,
        aiSummary: null,
        aiExtractedJson: null
      };

  // AI抽出日時 or メール受信日時
  const occurredAt = aiResult?.transactionDate
    ? new Date(`${aiResult.transactionDate}T12:00:00+09:00`)
    : receivedAt;

  await prisma.actionCandidate.create({
    data: {
      userId: mailbox.userId,
      sourceType: "MAIL",
      status: "PENDING",
      occurredAt,
      sourceRefId: message.id,
      ...candidateData
    }
  });

  await prisma.inboundMessage.update({
    where: { id: message.id },
    data: { parseStatus: "PARSED", parsedJson: aiResult as any }
  });

  console.log(
    `[INGEST] "${subject}" from ${fromAddress} → ${candidateData.candidateType} ¥${candidateData.amount ?? "?"} (${aiResult ? "AI" : "fallback"})`
  );

  // プッシュ通知: タイプ別フォーマット
  const merchant = candidateData.merchantRaw ?? candidateData.title;
  const amountStr = candidateData.amount != null ? `¥${candidateData.amount.toLocaleString()}` : "";
  let pushTitle: string;
  let pushBody: string;

  if (candidateData.candidateType === "INCOME") {
    pushTitle = amountStr ? `💰 入金 ${amountStr}が届きました` : "💰 入金がありました";
    pushBody = aiResult?.comment ?? "入金内容を確認してください";
  } else {
    pushTitle = "💡 取引通知が届きました！";
    pushBody = amountStr ? `${merchant}で ${amountStr}の利用` : merchant;
  }

  sendPushToUser(mailbox.userId, {
    title: pushTitle,
    body: pushBody,
    url: "/inbox"
  }).catch((err: unknown) => console.error("[INGEST] Push failed:", err));

  return c.json({ success: true, messageId: message.id });
});

export { app as ingestRoutes };
