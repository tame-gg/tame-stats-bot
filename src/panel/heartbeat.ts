import { ActivityType, type Activity, type Client, type PresenceStatus } from "discord.js";
import { tame } from "../api/tame.ts";
import { applyPresenceConfig } from "../presence.ts";
import {
  countLinks,
  countWatches,
  getDistinctWatchedPlayers,
  getWatchersForUuid,
  listAllLinks,
} from "../db.ts";
import { log } from "../log.ts";
import { pollerState } from "../poller/state.ts";
import {
  buildTelemetrySnapshot,
  getUnsyncedAudit,
  markAuditSynced,
  pruneOldAudit,
  telemetryCounters,
  auditEntryForSync,
  type TelemetrySnapshot,
} from "../telemetry/index.ts";

const BOT_VERSION = "0.1.0";
const startedAt = Date.now();

export type HeartbeatPresenceActivity = {
  type: string;
  name: string;
  details?: string;
  state?: string;
};

export type HeartbeatPresence = {
  status: PresenceStatus;
  activities: HeartbeatPresenceActivity[];
  activityType?: string;
  activityMessage?: string;
};

const ACTIVITY_TYPE_LABELS: Record<number, string> = {
  [ActivityType.Playing]: "playing",
  [ActivityType.Streaming]: "streaming",
  [ActivityType.Listening]: "listening",
  [ActivityType.Watching]: "watching",
  [ActivityType.Custom]: "custom",
  [ActivityType.Competing]: "competing",
};

function activityTypeLabel(type: number): string {
  return ACTIVITY_TYPE_LABELS[type] ?? "unknown";
}

function formatActivityMessage(activity: Activity): string {
  if (activity.type === ActivityType.Custom) {
    return activity.state ?? activity.name ?? "";
  }
  const parts = [activity.name, activity.details, activity.state].filter(Boolean);
  return parts.join(" · ") || activity.name;
}

export function collectPresence(client: Client<true>): HeartbeatPresence {
  const presence = client.user.presence;
  const status = presence?.status ?? "offline";
  const activities = (presence?.activities ?? []).map((activity) => ({
    type: activityTypeLabel(activity.type),
    name: activity.name,
    ...(activity.details ? { details: activity.details } : {}),
    ...(activity.state ? { state: activity.state } : {}),
  }));

  const primary = presence?.activities?.[0];
  return {
    status,
    activities,
    ...(primary
      ? {
          activityType: activityTypeLabel(primary.type),
          activityMessage: formatActivityMessage(primary),
        }
      : {}),
  };
}

export type HeartbeatPayload = {
  botVersion: string;
  uptimeSec: number;
  guildCount: number;
  totalMemberCount: number;
  avgMemberCount: number;
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
  telemetry: TelemetrySnapshot;
  presence: HeartbeatPresence;
};

export function collectHeartbeatPayload(client: Client<true>): HeartbeatPayload {
  const guilds = [...client.guilds.cache.values()]
    .map((guild) => ({
      id: guild.id,
      name: guild.name,
      memberCount: guild.memberCount ?? 0,
    }))
    .sort((a, b) => b.memberCount - a.memberCount || a.name.localeCompare(b.name));

  const totalMemberCount = guilds.reduce((sum, guild) => sum + guild.memberCount, 0);
  const avgMemberCount = guilds.length > 0 ? Math.round(totalMemberCount / guilds.length) : 0;

  const links = listAllLinks();
  const watched = getDistinctWatchedPlayers();
  const mem = process.memoryUsage();
  const rssMb = Math.round(mem.rss / 1024 / 1024);
  const heapMb = Math.round(mem.heapUsed / 1024 / 1024);
  telemetryCounters.updatePeaks(rssMb, heapMb, guilds.length);

  return {
    botVersion: BOT_VERSION,
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    guildCount: guilds.length,
    totalMemberCount,
    avgMemberCount,
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
        rss: rssMb,
        heapUsed: heapMb,
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      },
      platform: process.platform,
      bunVersion: typeof Bun !== "undefined" ? Bun.version : process.version,
    },
    telemetry: buildTelemetrySnapshot(),
    presence: collectPresence(client),
  };
}

async function syncAuditBatch(): Promise<void> {
  const batch = getUnsyncedAudit(100);
  if (batch.length === 0) return;
  const entries = batch.map(auditEntryForSync);
  await tame.postAuditBatch(entries);
  markAuditSynced(batch.map((entry) => entry.id));
  pruneOldAudit();
}

export async function postHeartbeat(client: Client<true>): Promise<void> {
  const payload = collectHeartbeatPayload(client);
  const response = await tame.postHeartbeat(payload);
  if (response.presence) {
    applyPresenceConfig(client, response.presence);
  }
  await syncAuditBatch().catch((err) => log.debug({ err }, "audit sync skipped"));
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
