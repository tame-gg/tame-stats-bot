import { env } from "./env.ts";
import { log } from "./log.ts";
import { pollerState } from "./poller/state.ts";

let server: ReturnType<typeof Bun.serve> | null = null;
const startedAt = Date.now();

export function startHealthServer(): void {
  if (server) return;
  const port = env.HEALTH_PORT;
  if (port === 0) {
    log.info("health server disabled (HEALTH_PORT=0)");
    return;
  }
  try {
    server = Bun.serve({
      port,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/health") {
          // pollerLastTick is 0 until the first tick completes; clients should
          // tolerate that during cold start (the bot login + ready handshake
          // can take 5s+ before the poller has even started).
          return Response.json({
            ok: true,
            uptime: Math.floor((Date.now() - startedAt) / 1000),
            pollerLastTick: pollerState.lastTickAt,
          });
        }
        return new Response("Not found", { status: 404 });
      },
    });
    log.info({ port }, "health server listening");
  } catch (err) {
    log.error({ err, port }, "health server failed to start");
  }
}

export function stopHealthServer(): void {
  if (!server) return;
  server.stop(true);
  server = null;
  log.info("health server stopped");
}
