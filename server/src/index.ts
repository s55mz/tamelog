import "dotenv/config";

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { allowedOrigins, port } from "./config";
import { jsonError } from "./lib/errors";
import { accountsRoutes } from "./routes/accounts";
import { accountTransfersRoutes } from "./routes/accountTransfers";
import { authRoutes } from "./routes/auth";
import { categoriesRoutes } from "./routes/categories";
import { dashboardRoutes } from "./routes/dashboard";
import { goalsRoutes } from "./routes/goals";
import { recordsRoutes } from "./routes/records";
import { setupRoutes } from "./routes/setup";
import { usersRoutes } from "./routes/users";

const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: allowedOrigins,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
  })
);

app.onError((error, c) => {
  console.error(error);
  return jsonError(c, "想定外のエラーが発生しました", 500);
});

app.get("/api/health", (c) =>
  c.json({
    data: {
      status: "ok",
      timestamp: new Date().toISOString()
    }
  })
);

app.route("/api/setup", setupRoutes);
app.route("/api/auth", authRoutes);
app.route("/api/users", usersRoutes);
app.route("/api/dashboard", dashboardRoutes);
app.route("/api/accounts", accountsRoutes);
app.route("/api/records", recordsRoutes);
app.route("/api/account-transfers", accountTransfersRoutes);
app.route("/api/goals", goalsRoutes);
app.route("/api/categories", categoriesRoutes);

app.get("/", (c) =>
  c.json({
    data: {
      name: "tamelog-api",
      message: "Use /api/health, /api/setup/* or /api/auth/*"
    }
  })
);

serve(
  {
    fetch: app.fetch,
    port
  },
  (info) => {
    console.log(`API listening on http://localhost:${info.port}`);
  }
);
