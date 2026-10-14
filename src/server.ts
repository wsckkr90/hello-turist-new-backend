import http from "node:http";
import app from "./app";
import { prisma } from "./lib/prisma";
import { attachWebSocketServer } from "./realtime/websocket";
import { startDispatchMonitoringWorker } from "./modules/ride/dispatch-expiry.worker";
import { startAutoDispatchWorker } from "./modules/ride/auto-dispatch.worker";
import { startAutoGuideDispatchWorker } from "./modules/ride/auto-guide-dispatch.worker";
import { startSafetyMonitoringWorker } from "./modules/safety/safety-monitor.worker";

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const DB_RETRY_DELAY_MS = 3_000;
const DB_MAX_RETRIES = 10;

async function waitForDatabase() {
  for (let attempt = 1; attempt <= DB_MAX_RETRIES; attempt += 1) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log("PostgreSQL connection ready");
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`PostgreSQL connection failed (attempt ${attempt}/${DB_MAX_RETRIES}): ${message}`);
      if (attempt === DB_MAX_RETRIES) {
        throw new Error(
          "PostgreSQL is not reachable. Check DATABASE_URL and make sure PostgreSQL is running on the configured host/port.",
          { cause: error },
        );
      }
      await new Promise((resolve) => setTimeout(resolve, DB_RETRY_DELAY_MS));
    }
  }
}

async function startServer() {
  await waitForDatabase();

  const server = http.createServer(app);
  attachWebSocketServer(server);

  server.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
    startSafetyMonitoringWorker();
    startDispatchMonitoringWorker();
    startAutoDispatchWorker();
    startAutoGuideDispatchWorker();
  });
}

process.on("SIGTERM", async () => {
  console.log("SIGTERM received; shutting down gracefully");
  try { await prisma.$disconnect(); } finally { process.exit(0); }
});

process.on("SIGINT", async () => {
  console.log("SIGINT received; shutting down gracefully");
  try { await prisma.$disconnect(); } finally { process.exit(0); }
});

startServer().catch((error) => {
  console.error("Backend startup failed:", error);
  process.exit(1);
});
