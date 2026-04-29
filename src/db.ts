import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { env } from "./env.ts";

export type WatchRow = {
  discord_user_id: string;
  uuid: string;
  ign: string;
  added_at: number;
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

// Run migrations *before* the prepared statements below — `db.query()`
// validates SQL against the live schema at prepare time, so a fresh
// install (no tables yet) crashes if we wait for index.ts to call us.
// Idempotent thanks to `CREATE TABLE IF NOT EXISTS`.
migrate();

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
  `);
}

const insertWatch = db.query(
  "INSERT INTO watches (discord_user_id, uuid, ign, added_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING"
);
// We RETURNING ign so the slash command can echo the stored canonical IGN
// rather than whatever case the user typed at the command line.
const deleteWatchByUuid = db.query<{ ign: string }, [string, string]>(
  "DELETE FROM watches WHERE discord_user_id = ? AND uuid = ? RETURNING ign"
);
const deleteWatchByIgn = db.query<{ ign: string }, [string, string]>(
  "DELETE FROM watches WHERE discord_user_id = ? AND lower(ign) = lower(?) RETURNING ign"
);
const getWatchesForUserQuery = db.query("SELECT discord_user_id, uuid, ign, added_at FROM watches WHERE discord_user_id = ? ORDER BY lower(ign)");
const countWatchesForUserQuery = db.query("SELECT count(*) AS count FROM watches WHERE discord_user_id = ?");
const distinctWatchesQuery = db.query("SELECT uuid, min(ign) AS ign FROM watches GROUP BY uuid ORDER BY lower(ign)");
const watchersForUuidQuery = db.query("SELECT discord_user_id, uuid, ign, added_at FROM watches WHERE uuid = ?");

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
const getLinksForGuildQuery = db.query(
  "SELECT discord_user_id, uuid, ign, guild_id, linked_at FROM links WHERE guild_id = ? OR guild_id IS NULL"
);

const getGuildConfigQuery = db.query("SELECT guild_id, alert_channel_id, updated_at FROM guild_config WHERE guild_id = ?");
const getGuildConfigsWithAlertsQuery = db.query(
  "SELECT guild_id, alert_channel_id, updated_at FROM guild_config WHERE alert_channel_id IS NOT NULL"
);

export function addWatch(discordUserId: string, uuid: string, ign: string): boolean {
  const result = insertWatch.run(discordUserId, uuid, ign, Date.now());
  return result.changes > 0;
}

/** Returns the canonical IGN of the row removed, or null if nothing matched. */
export function removeWatch(discordUserId: string, uuidOrIgn: string): string | null {
  const byUuid = deleteWatchByUuid.get(discordUserId, uuidOrIgn);
  if (byUuid) return byUuid.ign;
  return deleteWatchByIgn.get(discordUserId, uuidOrIgn)?.ign ?? null;
}

export function getWatchesForUser(discordUserId: string): WatchRow[] {
  return getWatchesForUserQuery.all(discordUserId) as WatchRow[];
}

export function countWatchesForUser(discordUserId: string): number {
  const row = countWatchesForUserQuery.get(discordUserId) as { count: number } | null;
  return Number(row?.count ?? 0);
}

export function getDistinctWatchedPlayers(): WatchedPlayerRow[] {
  return distinctWatchesQuery.all() as WatchedPlayerRow[];
}

export function getWatchersForUuid(uuid: string): WatchRow[] {
  return watchersForUuidQuery.all(uuid) as WatchRow[];
}

export function upsertLink(discordUserId: string, uuid: string, ign: string, guildId: string | null): void {
  upsertLinkQuery.run(discordUserId, uuid, ign, guildId, Date.now());
}

export function deleteLink(discordUserId: string): boolean {
  return deleteLinkQuery.run(discordUserId).changes > 0;
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
