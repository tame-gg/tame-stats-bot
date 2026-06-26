import type { Client } from "discord.js";
import { tame } from "../api/tame.ts";
import { countLinks, listAllLinks, upsertLinkAt } from "../db.ts";
import { log } from "../log.ts";

/**
 * Repopulate local SQLite links from Postgres on cold start. The bot's
 * volume is often ephemeral (Railway, Pterodactyl) while discord_links on
 * tame.gg persists — without this, /link appears to "forget" users after
 * every restart even though the website still shows them linked.
 */
export async function syncLinksFromPanel(): Promise<{ synced: number; before: number }> {
  const before = countLinks();
  let remote: Awaited<ReturnType<typeof tame.listDiscordLinks>>;
  try {
    remote = await tame.listDiscordLinks();
  } catch (err) {
    log.warn({ err }, "link sync: failed to fetch discord_links from panel");
    return { synced: 0, before };
  }

  for (const row of remote) {
    const linkedAtMs =
      typeof row.linkedAt === "number" && Number.isFinite(row.linkedAt)
        ? row.linkedAt > 1_000_000_000_000
          ? row.linkedAt
          : row.linkedAt * 1000
        : Date.now();
    upsertLinkAt(row.discordUserId, row.uuid, row.ign, row.guildId ?? null, linkedAtMs);
  }

  const after = countLinks();
  log.info({ before, after, remote: remote.length }, "link sync complete");
  return { synced: after - before, before };
}

export async function syncLinksOnReady(client: Client<true>): Promise<void> {
  const result = await syncLinksFromPanel();
  if (result.before === 0 && result.synced > 0) {
    log.info({ synced: result.synced }, "restored links from Postgres after empty local DB");
  }

  // If local has links missing from a successful fetch, push them up. Rare —
  // usually the opposite direction — but covers split-brain after a partial outage.
  const local = listAllLinks();
  if (local.length === 0) return;

  let remoteIds: Set<string>;
  try {
    const remote = await tame.listDiscordLinks();
    remoteIds = new Set(remote.map((r) => r.discordUserId));
  } catch {
    return;
  }

  for (const link of local) {
    if (remoteIds.has(link.discord_user_id)) continue;
    try {
      const user = await client.users.fetch(link.discord_user_id).catch(() => null);
      await tame.pushDiscordLink({
        discordUserId: link.discord_user_id,
        discordUsername: user?.username ?? link.discord_user_id,
        uuid: link.uuid,
        ign: link.ign,
        guildId: link.guild_id,
        linkedAt: Math.floor(link.linked_at / 1000),
      });
      log.info({ userId: link.discord_user_id, ign: link.ign }, "pushed orphan local link to Postgres");
    } catch (err) {
      log.warn({ err, userId: link.discord_user_id }, "failed to push orphan local link");
    }
  }
}
