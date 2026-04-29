import { TameApiError, tame } from "./tame.ts";
import { log } from "../log.ts";

/**
 * Hits `/api/bot/resolve/Notch` once at startup. Notch is a guaranteed-real
 * Mojang account that resolves cleanly when the bot token is valid, so a
 * non-401 response confirms the bot can talk to stats.tame.gg AND the
 * shared TAME_BOT_TOKEN matches. We fail-fast on 401 because every slash
 * command would otherwise return generic errors and the cause would be
 * invisible until someone reads the logs.
 */
export async function runStartupSelfCheck(): Promise<void> {
  try {
    const resolved = await tame.resolve("Notch");
    if (!resolved) {
      // 404 from a Mojang lookup of "Notch" means upstream is broken, not us.
      log.warn(
        "self-check: /api/bot/resolve/Notch returned 404 — Mojang upstream may be flaky, continuing",
      );
      return;
    }
    log.info({ uuid: resolved.uuid, ign: resolved.ign }, "self-check: tame api reachable");
  } catch (err) {
    if (err instanceof TameApiError && err.kind === "unauthorized") {
      log.fatal(
        "self-check FAILED: 401 from /api/bot/resolve. TAME_BOT_TOKEN does not match the value configured on stats.tame.gg. " +
          "Refusing to start — slash commands would all be silently broken otherwise.",
      );
      process.exit(1);
    }
    if (err instanceof TameApiError) {
      log.warn(
        { kind: err.kind, status: err.status },
        "self-check: tame api unhealthy, starting anyway (commands will degrade gracefully)",
      );
      return;
    }
    log.warn({ err }, "self-check: unexpected error, starting anyway");
  }
}
