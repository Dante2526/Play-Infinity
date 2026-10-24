import type { Server } from "node:http";

export const DEFAULT_DRAIN_TIMEOUT_MS = 20 * 1000;

// Keep PM2's deadline longer than this deadline (see ecosystem.config.cjs).
export function configureServerLifecycle(server: Server) {
  const configured = Number(process.env.APP_DRAIN_TIMEOUT_MS);
  const drainTimeout = Number.isSafeInteger(configured) && configured > 0
    ? configured : DEFAULT_DRAIN_TIMEOUT_MS;
  let shuttingDown = false;

  server.once("listening", () => {
    if (typeof process.send === "function") process.send("ready");
  });
  server.on("error", (error) => {
    console.error("[Server Listen Error]", error);
    process.exit(1);
  });

  function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Server] ${signal}: aguardando conexões ativas por até ${drainTimeout}ms.`);
    // Stop accepting connections, but finish existing responses. Node closes
    // idle keep-alive sockets; active video responses are left untouched.
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => {
      console.warn("[Server] Limite de drenagem atingido; encerrando conexões restantes.");
      process.exit(1);
    }, drainTimeout).unref();
  }
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
