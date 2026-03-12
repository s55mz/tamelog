import type { CategoryType } from "@prisma/client";

import { prisma } from "./prisma";

const defaultCategories: Array<{
  name: string;
  type: CategoryType;
  icon: string;
  sortOrder: number;
}> = [
  { name: "給料", type: "INCOME", icon: "briefcase", sortOrder: 1 },
  { name: "臨時収入", type: "INCOME", icon: "sparkles", sortOrder: 2 },
  { name: "その他", type: "INCOME", icon: "circle", sortOrder: 3 },
  { name: "食費", type: "EXPENSE", icon: "utensils", sortOrder: 1 },
  { name: "日用品", type: "EXPENSE", icon: "package", sortOrder: 2 },
  { name: "交通費", type: "EXPENSE", icon: "train", sortOrder: 3 },
  { name: "趣味", type: "EXPENSE", icon: "gamepad", sortOrder: 4 },
  { name: "衣類", type: "EXPENSE", icon: "shirt", sortOrder: 5 },
  { name: "医療", type: "EXPENSE", icon: "heart-pulse", sortOrder: 6 },
  { name: "住居", type: "EXPENSE", icon: "house", sortOrder: 7 },
  { name: "通信", type: "EXPENSE", icon: "wifi", sortOrder: 8 },
  { name: "その他", type: "EXPENSE", icon: "circle", sortOrder: 9 }
];

export async function ensureDefaultCategories(userId: string) {
  const existingCount = await prisma.category.count({
    where: { userId }
  });

  if (existingCount > 0) {
    return;
  }

  await prisma.category.createMany({
    data: defaultCategories.map((category) => ({
      userId,
      ...category,
      isDefault: true
    }))
  });
}
