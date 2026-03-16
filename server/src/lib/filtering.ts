import type { Prisma, ServiceCategoryCode } from "@prisma/client";

const defaultCategories: Array<{ code: ServiceCategoryCode; name: string; sortOrder: number }> = [
  { code: "EC", name: "ECサイト", sortOrder: 1 },
  { code: "PAYMENT", name: "決済アプリ", sortOrder: 2 }
];

type FilteringDb = Prisma.TransactionClient & {
  serviceCategory: {
    upsert: Prisma.TransactionClient["serviceCategory"]["upsert"];
  };
};

export async function ensureDefaultServiceCategories(db: FilteringDb) {
  await Promise.all(
    defaultCategories.map((category) =>
      db.serviceCategory.upsert({
        where: { code: category.code },
        update: {
          name: category.name,
          sortOrder: category.sortOrder
        },
        create: category
      })
    )
  );
}

export function getDefaultSchedule(categoryCode: ServiceCategoryCode, categoryName?: string) {
  if (categoryCode === "PAYMENT") {
    return {
      categoryCode,
      categoryName: categoryName ?? "決済アプリ",
      enabled: false,
      days: [0, 1, 2, 3, 4, 5, 6],
      startTime: "00:00",
      endTime: "23:59"
    };
  }

  return {
    categoryCode,
    categoryName: categoryName ?? "ECサイト",
    enabled: false,
    days: [0, 1, 2, 3, 4, 5, 6],
    startTime: "22:00",
    endTime: "08:00"
  };
}

type ScheduleRow = {
  category: {
    code: ServiceCategoryCode;
    name: string;
    sortOrder: number;
  };
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  enabled: boolean;
};

type ScheduleCategory = {
  code: ServiceCategoryCode;
  name: string;
  sortOrder: number;
};

export function serializeBlockSchedules(categories: ScheduleCategory[], rows: ScheduleRow[]) {
  const scheduleMap = new Map(
    categories.map((category) => [
      category.code,
      { ...getDefaultSchedule(category.code, category.name), sortOrder: category.sortOrder }
    ])
  );

  for (const row of rows) {
    const current = scheduleMap.get(row.category.code);
    if (!current) {
      continue;
    }

    current.enabled = row.enabled;
    current.startTime = row.startTime;
    current.endTime = row.endTime;
    if (!current.days.includes(row.dayOfWeek)) {
      current.days.push(row.dayOfWeek);
    }
  }

  return [...scheduleMap.values()]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map(({ sortOrder: _sortOrder, ...schedule }) => ({
      ...schedule,
      days: [...schedule.days].sort((left, right) => left - right)
    }));
}
