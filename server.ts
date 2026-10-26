import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import nextEnv from "@next/env";
import next from "next";
import pino from "pino";

const dev = process.env.NODE_ENV !== "production";
nextEnv.loadEnvConfig(process.cwd(), dev);

await import(pathToFileURL(`${process.cwd()}/scripts/load-config.mjs`).href);

const [{ pool }, { attachRealtime }] = await Promise.all([
  import("./lib/server/db"),
  import("./lib/server/realtime")
]);
const log = pino({ level: process.env.LOG_LEVEL ?? "info" });
const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOSTNAME ?? "127.0.0.1";

if (!dev && !process.env.APP_ORIGIN) {
  throw new Error("APP_ORIGIN is required in production so realtime and mutation origins can be checked.");
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

await pool.query("select 1 from users limit 0");
await app.prepare();

const budgets = new Map<string, { start: number; count: number }>();
const server = createServer((request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
  response.setHeader("X-Frame-Options", "DENY");
  if (request.url?.startsWith("/api/")) {
    response.setHeader("Cache-Control", "no-store");
    const size = Number(request.headers["content-length"] ?? 0);
    const upload = request.url.startsWith("/api/v1/assets") || request.url.startsWith("/api/v1/player/avatar");
    if (!Number.isFinite(size) || size > (upload ? 101 * 1024 * 1024 : 256 * 1024)) {
      response.writeHead(413).end("Request too large"); return;
    }
    // Chunked mutation bodies cannot bypass the declared-size limit.
    if (!["GET", "HEAD", "DELETE"].includes(request.method ?? "") && !request.headers["content-length"]) {
      response.writeHead(411).end("Content-Length required"); return;
    }
    if (request.url.startsWith("/api/v1/auth/") && request.method === "POST") {
      const key = request.socket.remoteAddress ?? "unknown";
      const now = Date.now();
      const budget = budgets.get(key);
      if (!budget || now - budget.start > 60000) budgets.set(key, { start: now, count: 1 });
      else if (++budget.count > 30) { response.writeHead(429, { "Retry-After": "60" }).end("Try again shortly"); return; }
      if (budgets.size > 10000) for (const [id, value] of budgets) if (now - value.start > 60000) budgets.delete(id);
    }
  }
  void handle(request, response).catch((error) => {
    log.error({ error, method: request.method, url: request.url }, "HTTP request failed");
    if (!response.headersSent) response.writeHead(500);
    response.end("Internal Server Error");
  });
});

const io = attachRealtime(server);
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

server.listen(port, hostname, () => {
  log.info({ hostname, port, environment: process.env.NODE_ENV ?? "development" }, "DND Battle Room listening");
});

async function shutdown(signal: string) {
  log.info({ signal }, "Shutting down");
  io.close();
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
