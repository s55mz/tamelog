import "dotenv/config";

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { allowedOrigins, port } from "./config";
import { jsonError } from "./lib/errors";
import { accountsRoutes } from "./routes/accounts";
import { candidatesRoutes } from "./routes/candidates";
import { ingestRoutes } from "./routes/ingest";
import { accountTransfersRoutes } from "./routes/accountTransfers";
import { adminRoutes } from "./routes/admin";
import { analysisRoutes, chatRoutes, ocrRoutes } from "./routes/ai";
import { authRoutes } from "./routes/auth";
import { categoriesRoutes } from "./routes/categories";
import { csvRoutes } from "./routes/csv";
import { dashboardRoutes } from "./routes/dashboard";
import { goalsRoutes } from "./routes/goals";
import { impulseRoutes } from "./routes/impulse";
import { pushRoutes } from "./routes/push";
import { recordsRoutes } from "./routes/records";
import { setupRoutes } from "./routes/setup";
import { usersRoutes } from "./routes/users";
import { startCronJobs } from "./lib/cron";
import { prisma } from "./lib/prisma";
import { mailboxRoutes } from "./routes/mailbox";
import { notificationsRoutes } from "./routes/notifications";
import { vpnRoutes } from "./routes/vpn";
import { webmailRoutes } from "./routes/webmail";

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

app.get("/api/status", async (c) => {
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch { /* ignore */ }
  const overall = db ? "ok" : "degraded";
  return c.json({
    data: {
      status: overall,
      services: { api: true, db },
      ts: new Date().toISOString()
    }
  });
});

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
app.route("/api/csv", csvRoutes);
app.route("/api/push", pushRoutes);
app.route("/api/vpn", vpnRoutes);
app.route("/api/candidates", candidatesRoutes);
app.route("/api/ingest", ingestRoutes);
app.route("/api/mailbox", mailboxRoutes);
app.route("/api/webmail", webmailRoutes);
app.route("/api/notifications", notificationsRoutes);

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
    startCronJobs();
  }
);
