import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";

import { jsonError } from "../lib/errors";
import { getPeriodId } from "../lib/period";
import { prisma } from "../lib/prisma";
import { ensureOwnedAccount } from "../lib/records";
import { requireAuth, type AuthContext } from "../middleware/auth";

const transferSchema = z.object({
  fromAccountId: z.string().min(1),
  toAccountId: z.string().min(1),
  amount: z.number().int().positive(),
  memo: z.string().trim().max(500).optional().nullable(),
  recordDate: z.string().date()
});

function handleTransferError(c: Context, error: unknown) {
  if (error instanceof Error && error.message === "ACCOUNT_NOT_FOUND") {
    return jsonError(c, "口座が見つかりません", 404);
  }

  return jsonError(c, "想定外のエラーが発生しました", 500);
}

export const accountTransfersRoutes = new Hono<AuthContext>();

accountTransfersRoutes.use("*", requireAuth);

accountTransfersRoutes.get("/", async (c) => {
  const authUser = c.get("authUser");
  const periodId = c.req.query("periodId");
  const limit = Number(c.req.query("limit") ?? "20");

  const transfers = await prisma.accountTransfer.findMany({
    where: {
      userId: authUser.id,
      ...(periodId ? { periodId } : {})
    },
    include: {
      fromAccount: { select: { id: true, name: true } },
      toAccount: { select: { id: true, name: true } }
    },
    orderBy: [{ recordDate: "desc" }, { createdAt: "desc" }],
    take: limit
  });

  return c.json({
    data: {
      transfers: transfers.map((transfer) => ({
        id: transfer.id,
        amount: transfer.amount,
        memo: transfer.memo,
        recordDate: transfer.recordDate.toISOString().slice(0, 10),
        periodId: transfer.periodId,
        fromAccount: transfer.fromAccount,
        toAccount: transfer.toAccount
      }))
    }
  });
});

accountTransfersRoutes.post("/", async (c) => {
  const authUser = c.get("authUser");
  const body = await c.req.json().catch(() => null);
  const parsed = transferSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "入力内容を確認してください", 400);
  }

  if (parsed.data.fromAccountId === parsed.data.toAccountId) {
    return jsonError(c, "移動元と移動先は同じにできません", 400);
  }

  const user = await prisma.user.findUnique({ where: { id: authUser.id } });
  if (!user) {
    return jsonError(c, "ログインが必要です", 401);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const fromAccount = await ensureOwnedAccount(tx, user.id, parsed.data.fromAccountId);
      const toAccount = await ensureOwnedAccount(tx, user.id, parsed.data.toAccountId);

      if (!fromAccount || !toAccount) {
        throw new Error("ACCOUNT_NOT_FOUND");
      }

      const periodId = getPeriodId(parsed.data.recordDate, user.paydayOfMonth);

      await tx.account.update({
        where: { id: fromAccount.id },
        data: {
          balance: {
            decrement: parsed.data.amount
          }
        }
      });

      await tx.account.update({
        where: { id: toAccount.id },
        data: {
          balance: {
            increment: parsed.data.amount
          }
        }
      });

      return tx.accountTransfer.create({
        data: {
          userId: user.id,
          fromAccountId: fromAccount.id,
          toAccountId: toAccount.id,
          amount: parsed.data.amount,
          memo: parsed.data.memo ?? null,
          recordDate: new Date(`${parsed.data.recordDate}T00:00:00.000Z`),
          periodId
        }
      });
    });

    return c.json(
      {
        data: {
          transfer: {
            id: result.id,
            amount: result.amount,
            periodId: result.periodId
          }
        }
      },
      201
    );
  } catch (error) {
    return handleTransferError(c, error);
  }
});

accountTransfersRoutes.delete("/:id", async (c) => {
  const authUser = c.get("authUser");

  try {
    await prisma.$transaction(async (tx) => {
      const transfer = await tx.accountTransfer.findFirst({
        where: { id: c.req.param("id"), userId: authUser.id }
      });

      if (!transfer) {
        throw new Error("TRANSFER_NOT_FOUND");
      }

      await tx.account.update({
        where: { id: transfer.fromAccountId },
        data: {
          balance: {
            increment: transfer.amount
          }
        }
      });

      await tx.account.update({
        where: { id: transfer.toAccountId },
        data: {
          balance: {
            decrement: transfer.amount
          }
        }
      });

      await tx.accountTransfer.delete({
        where: { id: transfer.id }
      });
    });

    return c.json({
      data: {
        success: true
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "TRANSFER_NOT_FOUND") {
      return jsonError(c, "口座移動が見つかりません", 404);
    }

    return jsonError(c, "想定外のエラーが発生しました", 500);
  }
});
