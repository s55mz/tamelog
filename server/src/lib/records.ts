import type { Prisma } from "@prisma/client";

export function getAccountBalanceDelta(type: "INCOME" | "EXPENSE" | "SAVING", amount: number) {
  if (type === "INCOME") {
    return amount;
  }

  return -amount;
}

export async function ensureOwnedAccount(tx: Prisma.TransactionClient, userId: string, accountId: string) {
  return tx.account.findFirst({
    where: {
      id: accountId,
      userId
    }
  });
}

export async function ensureOwnedGoal(tx: Prisma.TransactionClient, userId: string, goalId: string) {
  return tx.goal.findFirst({
    where: {
      id: goalId,
      userId
    }
  });
}

export async function ensureOwnedCategory(tx: Prisma.TransactionClient, userId: string, categoryId: string) {
  return tx.category.findFirst({
    where: {
      id: categoryId,
      userId
    }
  });
}
