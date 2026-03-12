import { Hono } from "hono";

import { ensureDefaultCategories } from "../lib/defaultCategories";
import { prisma } from "../lib/prisma";
import { requireAuth, type AuthContext } from "../middleware/auth";

export const categoriesRoutes = new Hono<AuthContext>();

categoriesRoutes.use("*", requireAuth);

categoriesRoutes.get("/", async (c) => {
  const authUser = c.get("authUser");
  const type = c.req.query("type");

  await ensureDefaultCategories(authUser.id);

  const categories = await prisma.category.findMany({
    where: {
      userId: authUser.id,
      ...(type ? { type: type as "INCOME" | "EXPENSE" } : {})
    },
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }]
  });

  return c.json({
    data: {
      categories
    }
  });
});
