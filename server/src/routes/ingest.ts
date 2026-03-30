import { Hono } from "hono";

import { getPeriodId } from "../lib/period";
import { prisma } from "../lib/prisma";
import { sendPushToUser } from "../lib/sendPush";
import { applyUserScriptToMessage } from "./webmail";

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
  accountHint: string | null;
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
  budgetCtx: { income: number; expense: number; balance: number },
  userAccounts: Array<{ id: string; name: string; type: string }>
): Promise<AiParseResult | null> {
  const budgetLine = `今期の収入 ¥${budgetCtx.income.toLocaleString()} / 支出 ¥${budgetCtx.expense.toLocaleString()} / 収支 ¥${budgetCtx.balance.toLocaleString()}`;
  const accountList = userAccounts.map((a) => `- ${a.name}（${a.type}）`).join("\n");

  const senderDisplayName = fromAddress.match(/^"?([^"<]+?)"?\s*<[^>]+>/)?.[1]?.trim();
  const senderDisplay = senderDisplayName ? `${senderDisplayName} <${fromAddress.match(/<([^>]+)>/)?.[1] ?? fromAddress}>` : fromAddress;

  const prompt = `以下はメールアドレスに届いたメールです。
家計簿アプリ向けに解析し、JSONで返してください。

差出人: ${senderDisplay}
件名: ${subject}
本文（先頭1500字）:
${bodyText.slice(0, 1500)}

【ユーザーの今期家計状況】
${budgetLine}

【ユーザーの登録口座一覧】
${accountList}

以下のJSON形式で返してください（コードブロック不要、JSONのみ）:
{
  "isTransaction": true | false,
  "transactionDate": "YYYY-MM-DD形式の取引日または null（本文に明記されていない場合）",
  "amount": 数値または null（金額が不明な場合）,
  "candidateType": "EXPENSE" | "INCOME" | "TRANSFER" | "SAVING",
  "title": "簡潔なタイトル（最大40文字）",
  "merchant": "実際の店舗・会社・サービス名（例: ファミリーマート, Amazon, 三井住友銀行, PayPay, 東京電力）。メールアドレスやドメインは絶対に入れず、人間が読める名称のみ。不明なら null",
  "memo": "補足メモまたは null",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "needsUserInput": true | false,
  "categoryName": "カテゴリ名または null（食費/交通費/外食/日用品/娯楽/医療/通信費/給与/副収入 など）",
  "accountHint": "上記の登録口座一覧から最も該当する口座名（完全一致で）、判断できなければ null",
  "comment": "家計状況を踏まえた短いコメント（1〜2文、タメ口OK、絵文字可）"
}

isTransaction 判断基準（最重要）:
- true: 実際の入出金・引落・利用・決済・振込・入金の通知
- false: テスト送信・転送設定確認・認証コード・案内・サービス登録確認・広告・パスワードリセット等
  ※ 「テスト」「確認」「ご登録」「認証」「案内」「お知らせ」のみで金額が一切ない場合は false

candidateType 判断基準（isTransaction=trueの場合のみ意味を持つ）:
- カード利用・引落・購入・支払い完了・口座振替 → EXPENSE
- 給与・賞与・振込入金・振込受取・入金確認 → INCOME
- 自分の口座間移動・定期振替・積立振替（同一人物の別口座へ） → TRANSFER
- 積立・貯金（TRANSFER以外の貯蓄目的） → SAVING
- 金額が本文に明確に記載されている → confidence HIGH
- 金額が曖昧・未確定・記載なし → confidence LOW かつ needsUserInput true

給与・振込の判断補助:
- 「給与」「賞与」「振込」「振込入金」「お振込」「給与振込」→ INCOME / categoryName "給与" または "振込"
- 「口座振替」「自動振替」「定期振替」「積立振替」→ TRANSFER
- 差出人が同じ銀行ドメインで「振替」→ TRANSFER の可能性が高い
- 差出人が雇用主・会社・人事系ドメインで「振込」→ INCOME / categoryName "給与"

accountHint 判断基準:
- メール差出人ドメイン・件名・本文から、どの口座の通知かを判定する
- 登録口座名と完全一致する文字列のみを返す（リストにない名前は返さない）
- 判断できなければ null

comment は家計状況に合わせてポジティブ/注意を促す一言（例: 支出多めなら「今月ちょっと使いすぎかも😅」、入金なら「お給料日！貯金に回してみて💪」）`;

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
        max_tokens: 350
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
    if (typeof json.accountHint !== "string") json.accountHint = null;

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

  // ユーザースクリプト実行（非同期・fire-and-forget）
  void applyUserScriptToMessage(mailbox.userId, message.id, {
    from: fromAddress,
    subject,
    body: rawText.slice(0, 1000)
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

  // ユーザー口座一覧を取得（AI口座推定 + 自動記帳で使用）
  const userAccounts = await prisma.account.findMany({
    where: { userId: mailbox.userId },
    select: { id: true, name: true, type: true, isPrimary: true }
  });

  // AI 解析
  const sysConfig = await prisma.systemConfig.findUnique({ where: { id: "system" } });
  const apiKey = sysConfig?.openaiApiKey ?? process.env.OPENAI_API_KEY ?? null;

  let aiResult: AiParseResult | null = null;
  if (apiKey) aiResult = await parseWithAI(apiKey, subject, fromAddress, rawText, budgetCtx, userAccounts);

  // AIが「取引ではない」と判定した場合は候補作成せず終了
  if (aiResult && !aiResult.isTransaction) {
    console.log(`[INGEST] AI classified as non-transaction: "${subject}" from ${fromAddress}`);
    await prisma.inboundMessage.update({ where: { id: message.id }, data: { parseStatus: "DUPLICATE", parsedJson: aiResult as any } });
    return c.json({ saved: true, candidate: false, reason: "not_transaction" });
  }

  // 差出人の表示名を抽出 (例: "ファミリーマート <noreply@famima.com>" → "ファミリーマート")
  const displayNameMatch = fromAddress.match(/^"?([^"<]+?)"?\s*<[^>]+>/);
  const displayName = displayNameMatch ? displayNameMatch[1].trim() : null;
  const fallbackMerchant = displayName || null; // メアドはfallbackに使わない

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

  // ─── 既存PENDING候補との照合（情報補完・自動確定） ────────────────────────
  // 同種別・3日以内のPENDING/NEEDS_INPUTに対し、送信元ドメイン or 金額 or 店舗名で照合
  let candidate: { id: string } | null = null;
  // 自動記帳判定に使う最終的な値（補完後を反映）
  let effectiveAmount = candidateData.amount;
  let effectiveNeedsUserInput = candidateData.needsUserInput;
  let effectiveMerchantRaw = candidateData.merchantRaw;

  if (aiResult?.isTransaction) {
    const windowStart = new Date(occurredAt);
    windowStart.setDate(windowStart.getDate() - 3);
    const windowEnd = new Date(occurredAt);
    windowEnd.setDate(windowEnd.getDate() + 3);

    const senderDomain = fromAddress.match(/@([\w.-]+)/)?.[1]?.toLowerCase() ?? "";

    const existingCandidates = await prisma.actionCandidate.findMany({
      where: {
        userId: mailbox.userId,
        sourceType: "MAIL",
        candidateType: candidateData.candidateType as any,
        status: { in: ["PENDING", "NEEDS_INPUT"] },
        occurredAt: { gte: windowStart, lte: windowEnd }
      },
      include: { inboxMessage: { select: { fromAddress: true } } }
    });

    for (const existing of existingCandidates) {
      const existingDomain = existing.inboxMessage?.fromAddress?.match(/@([\w.-]+)/)?.[1]?.toLowerCase() ?? "";
      const sameDomain = senderDomain && existingDomain && senderDomain === existingDomain;
      const sameAmount = candidateData.amount != null && existing.amount != null && candidateData.amount === existing.amount;
      const merchantA = (candidateData.merchantRaw ?? "").toLowerCase();
      const merchantB = (existing.merchantRaw ?? "").toLowerCase();
      const merchantOverlap = merchantA && merchantB && (merchantA.includes(merchantB) || merchantB.includes(merchantA));

      if (sameDomain || sameAmount || merchantOverlap) {
        // 既存候補を新しい情報で補完
        const merged = {
          amount: candidateData.amount ?? existing.amount,
          merchantRaw: candidateData.merchantRaw ?? existing.merchantRaw,
          memoDraft: candidateData.memoDraft ?? existing.memoDraft,
          confidence: candidateData.confidence as any,
          needsUserInput: (candidateData.amount == null),
          aiSummary: candidateData.aiSummary ?? existing.aiSummary,
          aiExtractedJson: candidateData.aiExtractedJson ?? existing.aiExtractedJson,
          sourceRefId: message.id // 新しいメールを参照
        };

        await prisma.actionCandidate.update({ where: { id: existing.id }, data: merged });
        await prisma.inboundMessage.update({ where: { id: message.id }, data: { parseStatus: "PARSED", parsedJson: aiResult as any } });
        await prisma.candidateResolutionLog.create({
          data: {
            candidateId: existing.id,
            userId: mailbox.userId,
            action: "SUPPLEMENTED",
            payloadJson: { newMessageId: message.id, reason: sameDomain ? "same_domain" : sameAmount ? "same_amount" : "merchant_overlap" }
          }
        });

        // 補完後の実効値を更新
        effectiveAmount = merged.amount;
        effectiveNeedsUserInput = merged.needsUserInput;
        effectiveMerchantRaw = merged.merchantRaw ?? null;

        console.log(`[INGEST] Supplemented existing candidate ${existing.id}: "${existing.title}" ← "${subject}"`);
        candidate = existing;
        break;
      }
    }
  }

  // 照合なし → 新規候補作成
  if (!candidate) {
    candidate = await prisma.actionCandidate.create({
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
  }

  console.log(
    `[INGEST] "${subject}" from ${fromAddress} → ${candidateData.candidateType} ¥${candidateData.amount ?? "?"} (${aiResult ? "AI" : "fallback"})`
  );

  // ─── 自動記帳 ──────────────────────────────────────────────────────────────
  // 条件: 信頼度HIGH / 金額確定済み / ユーザー入力不要 / TRANSFER以外
  // TRANSFERは口座選択が必要なため自動記帳せずNEEDS_INPUTに変更
  if (candidateData.candidateType === "TRANSFER") {
    await prisma.actionCandidate.update({
      where: { id: candidate.id },
      data: { status: "NEEDS_INPUT", needsUserInput: true }
    });
  }

  let autoBooked = false;
  if (
    candidateData.candidateType !== "TRANSFER" &&
    candidateData.confidence === "HIGH" &&
    effectiveAmount !== null &&
    !effectiveNeedsUserInput
  ) {
    try {
      // ─── 口座解決 ─────────────────────────────────────────────────────────────
      // userAccountsはすでに取得済み。プライマリをそこから参照する。
      // 優先順: AIのaccountHint完全一致 → 送信元ドメイン部分一致 → プライマリ口座
      const primaryAccount = userAccounts.find((a) => a.isPrimary) ?? null;

      let resolvedAccount = primaryAccount;

      if (aiResult?.accountHint) {
        const hint = aiResult.accountHint.toLowerCase();
        // 完全一致 → ヒントが口座名に含まれる → 口座名がヒントに含まれる の順で照合
        const hintMatch =
          userAccounts.find((a) => a.name.toLowerCase() === hint) ??
          userAccounts.find((a) => a.name.toLowerCase().includes(hint)) ??
          userAccounts.find((a) => hint.includes(a.name.toLowerCase()));
        if (hintMatch) resolvedAccount = hintMatch;
      }

      if (resolvedAccount === primaryAccount) {
        // AIが特定できなかった場合、送信元ドメインで部分一致を試みる
        const senderDomain = fromAddress.match(/@([\w.-]+)/)?.[1] ?? "";
        if (senderDomain) {
          const domainMatch = userAccounts.find((a) =>
            senderDomain.toLowerCase().includes(a.name.toLowerCase()) ||
            a.name.toLowerCase().split(/[\s・]+/).some((part) => senderDomain.toLowerCase().includes(part))
          );
          if (domainMatch) resolvedAccount = domainMatch;
        }
      }

      console.log(`[INGEST] Account resolved: "${resolvedAccount?.name}" (hint="${aiResult?.accountHint ?? "none"}")`);

      if (primaryAccount) {
        // ─── 重複チェック ──────────────────────────────────────────────────────
        // 同日・同金額・同方向の記録またはCONFIRMED候補が既にあればスキップ
        const dayStart = new Date(occurredAt);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(occurredAt);
        dayEnd.setHours(23, 59, 59, 999);

        const recordTypeForDupCheck = candidateData.candidateType === "INCOME" ? "INCOME" : "EXPENSE";

        const [dupRecord, dupCandidate] = await Promise.all([
          prisma.dailyRecord.findFirst({
            where: {
              userId: mailbox.userId,
              amount: effectiveAmount!,
              type: recordTypeForDupCheck,
              recordDate: { gte: dayStart, lte: dayEnd }
            }
          }),
          prisma.actionCandidate.findFirst({
            where: {
              userId: mailbox.userId,
              amount: effectiveAmount!,
              candidateType: candidateData.candidateType as any,
              status: "CONFIRMED",
              occurredAt: { gte: dayStart, lte: dayEnd },
              id: { not: candidate.id }
            }
          })
        ]);

        if (dupRecord || dupCandidate) {
          await prisma.actionCandidate.update({
            where: { id: candidate.id },
            data: { status: "IGNORED", ignoredReason: "duplicate_auto_detected" }
          });
          await prisma.candidateResolutionLog.create({
            data: {
              candidateId: candidate.id,
              userId: mailbox.userId,
              action: "AUTO_IGNORED_DUPLICATE",
              payloadJson: {
                dupRecordId: dupRecord?.id ?? null,
                dupCandidateId: dupCandidate?.id ?? null
              }
            }
          });
          console.log(`[INGEST] Duplicate detected, skipped auto-booking: "${subject}" ¥${candidateData.amount}`);
          // 重複のため通知だけ出して終了
          sendPushToUser(mailbox.userId, {
            title: "📬 重複のためスキップしました",
            body: `${candidateData.merchantRaw ?? subject} ¥${candidateData.amount?.toLocaleString()} は既に記録済みです`,
            url: "/records"
          }).catch((err: unknown) => console.error("[INGEST] Push failed:", err));
          return c.json({ success: true, messageId: message.id, autoBooked: false, skippedDuplicate: true });
        }

        // AIが推定したカテゴリ名で照合
        const categoryName = aiResult?.categoryName ?? null;
        const recordTypeMap: Record<string, "INCOME" | "EXPENSE" | "SAVING"> = {
          INCOME: "INCOME",
          EXPENSE: "EXPENSE",
          SAVING: "SAVING",
          TRANSFER: "EXPENSE" // TRANSFERは口座情報不足のためEXPENSEにフォールバック
        };
        const recordType = recordTypeMap[candidateData.candidateType] ?? "EXPENSE";

        let categoryId: string | null = null;
        if (categoryName) {
          const category = await prisma.category.findFirst({
            where: {
              userId: mailbox.userId,
              name: { contains: categoryName },
              type: recordType === "INCOME" ? "INCOME" : "EXPENSE"
            }
          });
          categoryId = category?.id ?? null;
        }

        const recordDate = occurredAt;
        const periodId = getPeriodId(recordDate, userRecord?.paydayOfMonth ?? 1);

        const record = await prisma.$transaction(async (tx) => {
          const r = await tx.dailyRecord.create({
            data: {
              userId: mailbox.userId,
              accountId: resolvedAccount!.id,
              categoryId,
              type: recordType,
              amount: effectiveAmount!,
              memo: [effectiveMerchantRaw, candidateData.memoDraft].filter(Boolean).join(" ") || null,
              emotions: [],
              recordDate,
              recordedAt: new Date(),
              periodId
            }
          });
          const balanceDelta = recordType === "INCOME" ? effectiveAmount! : -effectiveAmount!;
          await tx.account.update({
            where: { id: resolvedAccount!.id },
            data: { balance: { increment: balanceDelta } }
          });
          return r;
        });

        await prisma.actionCandidate.update({
          where: { id: candidate.id },
          data: { status: "CONFIRMED", confirmedRecordId: record.id }
        });

        await prisma.candidateResolutionLog.create({
          data: {
            candidateId: candidate.id,
            userId: mailbox.userId,
            action: "AUTO_CONFIRMED",
            payloadJson: { source: "mail_ingest", recordId: record.id }
          }
        });

        autoBooked = true;
        console.log(`[INGEST] Auto-booked: "${subject}" → ${recordType} ¥${candidateData.amount} (recordId: ${record.id})`);
      }
    } catch (err) {
      console.error("[INGEST] Auto-booking failed, left as PENDING:", err);
    }
  }

  // ─── プッシュ通知 ──────────────────────────────────────────────────────────
  const merchant = candidateData.merchantRaw ?? candidateData.title;
  const amountStr = effectiveAmount != null ? `¥${effectiveAmount.toLocaleString()}` : "";
  let pushTitle: string;
  let pushBody: string;
  let pushUrl: string;

  if (autoBooked) {
    // 自動記帳成功
    if (candidateData.candidateType === "INCOME") {
      const isSalary = aiResult?.categoryName?.includes("給与") || aiResult?.categoryName?.includes("賞与");
      pushTitle = isSalary
        ? `💰 給与 ${amountStr}を自動記帳しました`
        : `💰 入金 ${amountStr}を自動記帳しました`;
    } else {
      pushTitle = `✅ ${amountStr} を自動記帳しました`;
    }
    pushBody = aiResult?.comment ?? merchant;
    pushUrl = "/records";

  } else if (candidateData.candidateType === "TRANSFER") {
    // 口座移動・振込 → 確認が必要
    pushTitle = amountStr
      ? `🔁 振込・口座移動 ${amountStr} の通知があります`
      : "🔁 振込・口座移動の通知があります";
    pushBody = "振込元・振込先の口座を確認してください";
    pushUrl = "/inbox";

  } else if (candidateData.needsUserInput || candidateData.amount === null) {
    // 金額不明・ユーザー入力が必要
    pushTitle = "📝 取引通知があります（金額を確認してください）";
    pushBody = `${merchant} — 金額や内容を確認・入力してください`;
    pushUrl = "/inbox";

  } else if (candidateData.confidence === "LOW" || !aiResult) {
    // 低信頼度またはAI解析失敗
    pushTitle = "❓ メール取引通知（内容を確認してください）";
    pushBody = amountStr
      ? `${merchant} ${amountStr} — 内容が不確かです。確認してください`
      : `${merchant} — 内容が特定できませんでした。確認してください`;
    pushUrl = "/inbox";

  } else if (candidateData.candidateType === "INCOME") {
    // INCOME だが自動記帳できなかった（MEDIUM信頼度など）
    pushTitle = amountStr ? `💰 入金 ${amountStr}の通知があります` : "💰 入金の通知があります";
    pushBody = aiResult.comment ?? "入金内容を確認してください";
    pushUrl = "/inbox";

  } else {
    // EXPENSE / SAVING で自動記帳できなかった
    pushTitle = "💡 取引通知が届きました";
    pushBody = amountStr ? `${merchant} で ${amountStr}` : merchant;
    pushUrl = "/inbox";
  }

  sendPushToUser(mailbox.userId, {
    title: pushTitle,
    body: pushBody,
    url: pushUrl
  }).catch((err: unknown) => console.error("[INGEST] Push failed:", err));

  return c.json({ success: true, messageId: message.id, autoBooked });
});

export { app as ingestRoutes };
