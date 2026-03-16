import "dotenv/config";

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { allowedOrigins, port } from "./config";
import { jsonError } from "./lib/errors";
import { accountsRoutes } from "./routes/accounts";
import { accountTransfersRoutes } from "./routes/accountTransfers";
import { adminRoutes } from "./routes/admin";
import { analysisRoutes, chatRoutes, ocrRoutes } from "./routes/ai";
import { authRoutes } from "./routes/auth";
import { categoriesRoutes } from "./routes/categories";
import { dashboardRoutes } from "./routes/dashboard";
import { goalsRoutes } from "./routes/goals";
import { impulseRoutes } from "./routes/impulse";
import { pushRoutes } from "./routes/push";
import { recordsRoutes } from "./routes/records";
import { setupRoutes } from "./routes/setup";
import { usersRoutes } from "./routes/users";
import { vpnRoutes } from "./routes/vpn";

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
app.route("/api/admin", adminRoutes);
app.route("/api/chat", chatRoutes);
app.route("/api/analysis", analysisRoutes);
app.route("/api/ocr", ocrRoutes);
app.route("/api/impulse-items", impulseRoutes);
app.route("/api/accounts", accountsRoutes);
app.route("/api/records", recordsRoutes);
app.route("/api/account-transfers", accountTransfersRoutes);
app.route("/api/goals", goalsRoutes);
app.route("/api/categories", categoriesRoutes);
app.route("/api/push", pushRoutes);
app.route("/api/vpn", vpnRoutes);

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
