import type { Client } from "discord.js";
import { tame } from "../api/tame.ts";
import {
  countLinks,
  countWatches,
  getDistinctWatchedPlayers,
  getWatchersForUuid,
  listAllLinks,
} from "../db.ts";
import { log } from "../log.ts";
import { pollerState } from "../poller/state.ts";

const BOT_VERSION = "0.1.0";
const startedAt = Date.now();

export type HeartbeatPayload = {
  botVersion: string;
  uptimeSec: number;
  guildCount: number;
  guilds: Array<{ id: string; name: string; memberCount: number }>;
  userInstallCount: number | null;
  linkedUsers: Array<{
    discordUserId: string;
    discordUsername: string;
    uuid: string;
    ign: string;
    guildId: string | null;
    linkedAt: number;
  }>;
  linkedUserCount: number;
  watchedPlayers: Array<{ uuid: string; ign: string; watcherCount: number }>;
  watchCount: number;
  uniqueWatchedPlayers: number;
  poller: { lastTickAt: number; watchedPlayerCount: number };
  system: Record<string, unknown>;
};

export function collectHeartbeatPayload(client: Client<true>): HeartbeatPayload {
  const guilds = [...client.guilds.cache.values()]
    .map((guild) => ({
      id: guild.id,
      name: guild.name,
      memberCount: guild.memberCount ?? 0,
    }))
    .sort((a, b) => b.memberCount - a.memberCount || a.name.localeCompare(b.name));

  const links = listAllLinks();
  const watched = getDistinctWatchedPlayers();
  const mem = process.memoryUsage();

  return {
    botVersion: BOT_VERSION,
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    guildCount: guilds.length,
    guilds,
    userInstallCount: client.application?.approximateUserInstallCount ?? null,
    linkedUsers: links.map((link) => ({
      discordUserId: link.discord_user_id,
      discordUsername: client.users.cache.get(link.discord_user_id)?.username ?? link.discord_user_id,
      uuid: link.uuid,
      ign: link.ign,
      guildId: link.guild_id,
      linkedAt: Math.floor(link.linked_at / 1000),
    })),
    linkedUserCount: countLinks(),
    watchedPlayers: watched.map((row) => ({
      uuid: row.uuid,
      ign: row.ign,
      watcherCount: getWatchersForUuid(row.uuid).length,
    })),
    watchCount: countWatches(),
    uniqueWatchedPlayers: watched.length,
    poller: {
      lastTickAt: pollerState.lastTickAt,
      watchedPlayerCount: watched.length,
    },
    system: {
      memoryMb: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      },
      platform: process.platform,
      bunVersion: typeof Bun !== "undefined" ? Bun.version : process.version,
    },
  };
}

export async function postHeartbeat(client: Client<true>): Promise<void> {
  const payload = collectHeartbeatPayload(client);
  await tame.postHeartbeat(payload);
}

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export function startHeartbeatReporter(
  client: Client<true>,
  intervalSec = 30,
): void {
  if (heartbeatTimer) return;

  const tick = () => {
    void postHeartbeat(client).catch((err) => log.warn({ err }, "heartbeat failed"));
  };

  tick();
  heartbeatTimer = setInterval(tick, intervalSec * 1000);
  log.info({ intervalSec }, "panel heartbeat reporter started");
}

export function stopHeartbeatReporter(): void {
  if (!heartbeatTimer) return;
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}
