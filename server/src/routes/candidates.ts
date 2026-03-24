import { Hono } from "hono";
import { z } from "zod";

import { jsonError } from "../lib/errors";
import { getPeriodId } from "../lib/period";
import { prisma } from "../lib/prisma";
import { requireAuth, type AuthContext } from "../middleware/auth";

export const candidatesRoutes = new Hono<AuthContext>();

candidatesRoutes.use("/*", requireAuth);

// POST /api/candidates — 手動候補作成（24時間保留など）
candidatesRoutes.post("/", async (c) => {
  const authUser = c.get("authUser");
  const body = await c.req.json().catch(() => ({}));

  const {
    sourceType = "MANUAL",
    candidateType = "EXPENSE",
    title,
    amount,
    occurredAt,
    accountId,
    categoryId,
    memoDraft,
    status = "PENDING",
    deferredUntil
  } = body as {
    sourceType?: string;
    candidateType?: string;
    title?: string;
    amount?: number;
    occurredAt?: string;
    accountId?: string;
    categoryId?: string;
    memoDraft?: string;
    status?: string;
    deferredUntil?: string;
  };

  if (!title) return jsonError(c, "title は必須です", 400);

  const candidate = await prisma.actionCandidate.create({
    data: {
      userId: authUser.id,
      sourceType: sourceType as any,
      candidateType: candidateType as any,
      status: status as any,
      confidence: "HIGH",
      occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
      title,
      amount: amount ?? null,
      accountId: accountId ?? null,
      categoryId: categoryId ?? null,
      memoDraft: memoDraft ?? null,
      needsUserInput: false,
      deferredUntil: deferredUntil ? new Date(deferredUntil) : null
    }
  });

  return c.json({ data: { candidate } }, 201);
});

// GET /api/candidates — 候補一覧
candidatesRoutes.get("/", async (c) => {
  const authUser = c.get("authUser");
  const status = c.req.query("status");
  const sourceType = c.req.query("sourceType");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 100);

  // ステータスフィルタ
  const statusFilter = status
    ? { status: status as any }
    : { status: { in: ["PENDING", "NEEDS_INPUT", "DEFERRED"] as any[] } };

  const where = {
    userId: authUser.id,
    ...statusFilter,
    ...(sourceType ? { sourceType: sourceType as any } : {})
  };

  const [candidates, pendingCount, deferredCount] = await Promise.all([
    prisma.actionCandidate.findMany({
      where,
      orderBy: [{ status: "asc" }, { occurredAt: "desc" }],
      take: limit,
      include: {
        category: { select: { id: true, name: true } },
        account: { select: { id: true, name: true } },
        inboxMessage: { select: { id: true, subject: true, fromAddress: true, rawText: true, receivedAt: true } }
      }
    }),
    prisma.actionCandidate.count({
      where: { userId: authUser.id, status: { in: ["PENDING", "NEEDS_INPUT"] } }
    }),
    prisma.actionCandidate.count({
      where: { userId: authUser.id, status: "DEFERRED" }
    })
  ]);

  // 最近確定した候補（今日）
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const recentConfirmed = await prisma.actionCandidate.findMany({
    where: {
      userId: authUser.id,
      status: "CONFIRMED",
      updatedAt: { gte: todayStart }
    },
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: { id: true, title: true, amount: true, updatedAt: true, candidateType: true }
  });

  return c.json({
    data: {
      candidates,
      summary: {
        pendingCount,
        deferredCount,
        recentConfirmed
      }
    }
  });
});

// GET /api/candidates/:id — 候補詳細
candidatesRoutes.get("/:id", async (c) => {
  const authUser = c.get("authUser");
  const id = c.req.param("id");

  const candidate = await prisma.actionCandidate.findFirst({
    where: { id, userId: authUser.id },
    include: {
      category: { select: { id: true, name: true, type: true } },
      account: { select: { id: true, name: true, type: true } },
      inboxMessage: { select: { id: true, subject: true, fromAddress: true, receivedAt: true } }
    }
  });

  if (!candidate) return jsonError(c, "候補が見つかりません", 404);

  return c.json({ data: { candidate } });
});

const confirmSchema = z.object({
  recordType: z.enum(["INCOME", "EXPENSE", "SAVING"]).optional(),
  transferFromAccountId: z.string().optional(),
  transferToAccountId: z.string().optional(),
  goalId: z.string().optional().nullable(),
  amount: z.number().int().positive(),
  accountId: z.string().optional(),
  categoryId: z.string().optional().nullable(),
  memo: z.string().trim().max(500).optional().nullable(),
  recordDate: z.string().date()
});

// POST /api/candidates/:id/confirm — 候補を正式記帳へ確定
candidatesRoutes.post("/:id/confirm", async (c) => {
  const authUser = c.get("authUser");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) return jsonError(c, "入力値が不正です", 400);

  const candidate = await prisma.actionCandidate.findFirst({
    where: { id, userId: authUser.id }
  });
  if (!candidate) return jsonError(c, "候補が見つかりません", 404);
  if (candidate.status === "CONFIRMED") return jsonError(c, "すでに確定済みです", 409);

  const { recordType, amount, accountId, categoryId, memo, recordDate, goalId, transferFromAccountId, transferToAccountId } = parsed.data;

  const recordDateObj = new Date(recordDate);
  const userRecord = await prisma.user.findUnique({ where: { id: authUser.id }, select: { paydayOfMonth: true } });
  const periodId = getPeriodId(recordDateObj, userRecord?.paydayOfMonth ?? 1);

  let confirmedRecordId: string | null = null;
  let confirmedTransferId: string | null = null;

  if (transferFromAccountId && transferToAccountId) {
    // 口座移動として確定
    const [from, to] = await Promise.all([
      prisma.account.findFirst({ where: { id: transferFromAccountId, userId: authUser.id } }),
      prisma.account.findFirst({ where: { id: transferToAccountId, userId: authUser.id } })
    ]);
    if (!from || !to) return jsonError(c, "口座が見つかりません", 404);

    const transfer = await prisma.$transaction(async (tx) => {
      const t = await tx.accountTransfer.create({
        data: {
          userId: authUser.id,
          fromAccountId: transferFromAccountId,
          toAccountId: transferToAccountId,
          goalId: goalId ?? null,
          kind: "TRANSFER",
          amount,
          memo: memo ?? null,
          recordDate: recordDateObj,
          periodId
        }
      });
      await tx.account.update({ where: { id: transferFromAccountId }, data: { balance: { decrement: amount } } });
      await tx.account.update({ where: { id: transferToAccountId }, data: { balance: { increment: amount } } });
      return t;
    });
    confirmedTransferId = transfer.id;
  } else {
    // 通常記録として確定
    if (!recordType || !accountId) return jsonError(c, "recordType と accountId が必要です", 400);

    const account = await prisma.account.findFirst({ where: { id: accountId, userId: authUser.id } });
    if (!account) return jsonError(c, "口座が見つかりません", 404);

    const record = await prisma.$transaction(async (tx) => {
      const r = await tx.dailyRecord.create({
        data: {
          userId: authUser.id,
          accountId,
          categoryId: categoryId ?? null,
          goalId: goalId ?? null,
          type: recordType,
          amount,
          memo: memo ?? null,
          emotions: [],
          recordDate: recordDateObj,
          recordedAt: new Date(),
          periodId
        }
      });

      const balanceDelta = recordType === "INCOME" ? amount : -amount;
      await tx.account.update({ where: { id: accountId }, data: { balance: { increment: balanceDelta } } });
      return r;
    });
    confirmedRecordId = record.id;
  }

  // 候補を確定済みに更新
  await prisma.actionCandidate.update({
    where: { id },
    data: {
      status: "CONFIRMED",
      confirmedRecordId,
      confirmedTransferId
    }
  });

  // 解決ログ
  await prisma.candidateResolutionLog.create({
    data: {
      candidateId: id,
      userId: authUser.id,
      action: "CONFIRMED",
      payloadJson: parsed.data as any
    }
  });

  return c.json({ data: { success: true, confirmedRecordId, confirmedTransferId } });
});

// POST /api/candidates/:id/defer — 保留
candidatesRoutes.post("/:id/defer", async (c) => {
  const authUser = c.get("authUser");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const deferredUntil = body.deferredUntil ? new Date(body.deferredUntil) : new Date(Date.now() + 24 * 60 * 60 * 1000);

  const candidate = await prisma.actionCandidate.findFirst({ where: { id, userId: authUser.id } });
  if (!candidate) return jsonError(c, "候補が見つかりません", 404);

  await prisma.actionCandidate.update({ where: { id }, data: { status: "DEFERRED", deferredUntil } });

  await prisma.candidateResolutionLog.create({
    data: {
      candidateId: id,
      userId: authUser.id,
      action: "DEFERRED",
      payloadJson: { deferredUntil: deferredUntil.toISOString() }
    }
  });

  return c.json({ data: { success: true } });
});

// POST /api/candidates/:id/ignore — 無視
candidatesRoutes.post("/:id/ignore", async (c) => {
  const authUser = c.get("authUser");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const reason: string | null = body.reason ?? null;

  const candidate = await prisma.actionCandidate.findFirst({ where: { id, userId: authUser.id } });
  if (!candidate) return jsonError(c, "候補が見つかりません", 404);

  await prisma.actionCandidate.update({ where: { id }, data: { status: "IGNORED", ignoredReason: reason } });

  await prisma.candidateResolutionLog.create({
    data: {
      candidateId: id,
      userId: authUser.id,
      action: "IGNORED",
      payloadJson: reason ? { reason } : undefined
    }
  });

  return c.json({ data: { success: true } });
});
