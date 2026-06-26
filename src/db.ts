import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { env } from "./env.ts";
import { WATCH_DURATION_MS } from "./watch/constants.ts";

export type WatchRow = {
  discord_user_id: string;
  uuid: string;
  ign: string;
  added_at: number;
  expires_at: number;
  expiry_notified: number;
  last_refresh_at: number;
};

export type LinkRow = {
  discord_user_id: string;
  uuid: string;
  ign: string;
  guild_id: string | null;
  linked_at: number;
};

export type GuildConfigRow = {
  guild_id: string;
  alert_channel_id: string | null;
  updated_at: number;
};

export type WatchedPlayerRow = {
  uuid: string;
  ign: string;
};

const dbPath = resolve(env.DATABASE_PATH);
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath, { create: true });
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

migrate();

function ensureColumn(table: string, column: string, definition: string): void {
  const cols = db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((col) => col.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS watches (
      discord_user_id TEXT NOT NULL,
      uuid            TEXT NOT NULL,
      ign             TEXT NOT NULL,
      added_at        INTEGER NOT NULL,
      PRIMARY KEY (discord_user_id, uuid)
    );
    CREATE INDEX IF NOT EXISTS watches_uuid_idx ON watches(uuid);

    CREATE TABLE IF NOT EXISTS links (
      discord_user_id TEXT PRIMARY KEY,
      uuid            TEXT NOT NULL,
      ign             TEXT NOT NULL,
      guild_id        TEXT,
      linked_at       INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS links_guild_idx ON links(guild_id);

    CREATE TABLE IF NOT EXISTS guild_config (
      guild_id          TEXT PRIMARY KEY,
      alert_channel_id  TEXT,
      updated_at        INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS command_audit (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      executed_at     INTEGER NOT NULL,
      interaction_type TEXT NOT NULL,
      command_name    TEXT NOT NULL,
      discord_user_id TEXT NOT NULL,
      discord_username TEXT,
      guild_id        TEXT,
      guild_name      TEXT,
      channel_id      TEXT,
      options_json    TEXT,
      success         INTEGER NOT NULL,
      error_message   TEXT,
      duration_ms     INTEGER NOT NULL,
      synced_at       INTEGER
    );
    CREATE INDEX IF NOT EXISTS command_audit_executed_at_idx ON command_audit(executed_at DESC);
    CREATE INDEX IF NOT EXISTS command_audit_synced_idx ON command_audit(synced_at);

    CREATE TABLE IF NOT EXISTS telemetry_kv (
      key   TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0
    );
  `);

  ensureColumn("watches", "expires_at", "INTEGER");
  ensureColumn("watches", "expiry_notified", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("watches", "last_refresh_at", "INTEGER NOT NULL DEFAULT 0");

  const now = Date.now();
  db.exec(`
    UPDATE watches SET expires_at = added_at + ${WATCH_DURATION_MS}
    WHERE expires_at IS NULL OR expires_at = 0;
  `);
}

const upsertWatch = db.query(`
  INSERT INTO watches (discord_user_id, uuid, ign, added_at, expires_at, expiry_notified, last_refresh_at)
  VALUES (?, ?, ?, ?, ?, 0, 0)
  ON CONFLICT(discord_user_id, uuid) DO UPDATE SET
    ign = excluded.ign,
    added_at = excluded.added_at,
    expires_at = excluded.expires_at,
    expiry_notified = 0
`);
const deleteWatchByUuid = db.query<{ ign: string }, [string, string]>(
  "DELETE FROM watches WHERE discord_user_id = ? AND uuid = ? RETURNING ign",
);
const deleteWatchByIgn = db.query<{ ign: string }, [string, string]>(
  "DELETE FROM watches WHERE discord_user_id = ? AND lower(ign) = lower(?) RETURNING ign",
);
const getWatchesForUserQuery = db.query(
  "SELECT discord_user_id, uuid, ign, added_at, expires_at, expiry_notified, last_refresh_at FROM watches WHERE discord_user_id = ? ORDER BY lower(ign)",
);
const countWatchesForUserQuery = db.query(
  "SELECT count(*) AS count FROM watches WHERE discord_user_id = ? AND expires_at > ?",
);
const distinctActiveWatchesQuery = db.query(
  "SELECT uuid, min(ign) AS ign FROM watches WHERE expires_at > ? GROUP BY uuid ORDER BY lower(ign)",
);
const activeWatchersForUuidQuery = db.query(
  "SELECT discord_user_id, uuid, ign, added_at, expires_at, expiry_notified, last_refresh_at FROM watches WHERE uuid = ? AND expires_at > ?",
);
const expiredUnnotifiedQuery = db.query(
  "SELECT discord_user_id, uuid, ign, added_at, expires_at, expiry_notified, last_refresh_at FROM watches WHERE expires_at <= ? AND expiry_notified = 0",
);
const markExpiryNotifiedQuery = db.query(
  "UPDATE watches SET expiry_notified = 1 WHERE discord_user_id = ? AND uuid = ?",
);
const extendWatchQuery = db.query(
  "UPDATE watches SET expires_at = ?, expiry_notified = 0 WHERE discord_user_id = ? AND uuid = ?",
);
const getWatchQuery = db.query(
  "SELECT discord_user_id, uuid, ign, added_at, expires_at, expiry_notified, last_refresh_at FROM watches WHERE discord_user_id = ? AND uuid = ? LIMIT 1",
);
const updateLastRefreshQuery = db.query(
  "UPDATE watches SET last_refresh_at = ? WHERE discord_user_id = ? AND uuid = ?",
);

const upsertLinkQuery = db.query(`
  INSERT INTO links (discord_user_id, uuid, ign, guild_id, linked_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(discord_user_id) DO UPDATE SET
    uuid = excluded.uuid,
    ign = excluded.ign,
    guild_id = excluded.guild_id,
    linked_at = excluded.linked_at
`);
const deleteLinkQuery = db.query("DELETE FROM links WHERE discord_user_id = ?");
const getLinkForUserQuery = db.query(
  "SELECT discord_user_id, uuid, ign, guild_id, linked_at FROM links WHERE discord_user_id = ? LIMIT 1",
);
const getLinksForGuildQuery = db.query(
  "SELECT discord_user_id, uuid, ign, guild_id, linked_at FROM links WHERE guild_id = ? OR guild_id IS NULL",
);

const getGuildConfigQuery = db.query(
  "SELECT guild_id, alert_channel_id, updated_at FROM guild_config WHERE guild_id = ?",
);
const getGuildConfigsWithAlertsQuery = db.query(
  "SELECT guild_id, alert_channel_id, updated_at FROM guild_config WHERE alert_channel_id IS NOT NULL",
);

export function addWatch(discordUserId: string, uuid: string, ign: string): boolean {
  const now = Date.now();
  const existing = getWatch(discordUserId, uuid);
  upsertWatch.run(discordUserId, uuid, ign, now, now + WATCH_DURATION_MS);
  if (!existing) {
    import("./telemetry/index.ts").then(({ telemetryCounters }) => telemetryCounters.watchAdd());
    return true;
  }
  return false;
}

export function extendWatch(discordUserId: string, uuid: string): boolean {
  const watch = getWatch(discordUserId, uuid);
  if (!watch) return false;
  const base = Math.max(Date.now(), watch.expires_at);
  extendWatchQuery.run(base + WATCH_DURATION_MS, discordUserId, uuid);
  return true;
}

export function getWatch(discordUserId: string, uuid: string): WatchRow | null {
  return (getWatchQuery.get(discordUserId, uuid) as WatchRow | null) ?? null;
}

export function removeWatch(discordUserId: string, uuidOrIgn: string): string | null {
  const byUuid = deleteWatchByUuid.get(discordUserId, uuidOrIgn);
  if (byUuid) {
    import("./telemetry/index.ts").then(({ telemetryCounters }) => telemetryCounters.watchRemove());
    return byUuid.ign;
  }
  const byIgn = deleteWatchByIgn.get(discordUserId, uuidOrIgn)?.ign ?? null;
  if (byIgn) import("./telemetry/index.ts").then(({ telemetryCounters }) => telemetryCounters.watchRemove());
  return byIgn;
}

export function getWatchesForUser(discordUserId: string): WatchRow[] {
  return getWatchesForUserQuery.all(discordUserId) as WatchRow[];
}

export function getActiveWatchesForUser(discordUserId: string, now = Date.now()): WatchRow[] {
  return getWatchesForUser(discordUserId).filter((row) => row.expires_at > now);
}

export function countWatchesForUser(discordUserId: string): number {
  const row = countWatchesForUserQuery.get(discordUserId, Date.now()) as { count: number } | null;
  return Number(row?.count ?? 0);
}

export function getDistinctWatchedPlayers(now = Date.now()): WatchedPlayerRow[] {
  return distinctActiveWatchesQuery.all(now) as WatchedPlayerRow[];
}

export function getWatchersForUuid(uuid: string, now = Date.now()): WatchRow[] {
  return activeWatchersForUuidQuery.all(uuid, now) as WatchRow[];
}

export function getExpiredUnnotifiedWatches(now = Date.now()): WatchRow[] {
  return expiredUnnotifiedQuery.all(now) as WatchRow[];
}

export function markExpiryNotified(discordUserId: string, uuid: string): void {
  markExpiryNotifiedQuery.run(discordUserId, uuid);
}

export function touchWatchRefresh(discordUserId: string, uuid: string, at = Date.now()): void {
  updateLastRefreshQuery.run(at, discordUserId, uuid);
}

export function upsertLink(discordUserId: string, uuid: string, ign: string, guildId: string | null): void {
  const existing = getLinkForUser(discordUserId);
  upsertLinkQuery.run(discordUserId, uuid, ign, guildId, Date.now());
  if (!existing) {
    import("./telemetry/index.ts").then(({ telemetryCounters }) => telemetryCounters.linkAdd());
  }
}

export function upsertLinkAt(
  discordUserId: string,
  uuid: string,
  ign: string,
  guildId: string | null,
  linkedAtMs: number,
): void {
  upsertLinkQuery.run(discordUserId, uuid, ign, guildId, linkedAtMs);
}

export function listAllLinks(): LinkRow[] {
  return db
    .query("SELECT discord_user_id, uuid, ign, guild_id, linked_at FROM links ORDER BY linked_at DESC")
    .all() as LinkRow[];
}

const countLinksQuery = db.query("SELECT count(*) AS count FROM links");
const countWatchesQuery = db.query("SELECT count(*) AS count FROM watches WHERE expires_at > ?");

export function countLinks(): number {
  const row = countLinksQuery.get() as { count: number } | null;
  return Number(row?.count ?? 0);
}

export function countWatches(): number {
  const row = countWatchesQuery.get(Date.now()) as { count: number } | null;
  return Number(row?.count ?? 0);
}

export function deleteLink(discordUserId: string): boolean {
  const removed = deleteLinkQuery.run(discordUserId).changes > 0;
  if (removed) import("./telemetry/index.ts").then(({ telemetryCounters }) => telemetryCounters.linkRemove());
  return removed;
}

export function getLinkForUser(discordUserId: string): LinkRow | null {
  return (getLinkForUserQuery.get(discordUserId) as LinkRow | null) ?? null;
}

export function getLinksForGuild(guildId: string): LinkRow[] {
  return getLinksForGuildQuery.all(guildId) as LinkRow[];
}

export function getGuildConfig(guildId: string): GuildConfigRow | null {
  return (getGuildConfigQuery.get(guildId) as GuildConfigRow | null) ?? null;
}

export function getGuildConfigsWithAlerts(): GuildConfigRow[] {
  return getGuildConfigsWithAlertsQuery.all() as GuildConfigRow[];
}
