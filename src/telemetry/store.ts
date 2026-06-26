import { db } from "../db.ts";
import type { AuditEntry, InteractionKind, TelemetrySnapshot } from "./types.ts";

const SESSION_KEY = "session_started_at";
const SESSION_COUNT_KEY = "session_count";
const PEAK_MEMORY_KEY = "peak_memory_mb";
const PEAK_HEAP_KEY = "peak_heap_mb";
const PEAK_GUILDS_KEY = "peak_guild_count";
const GUILD_JOIN_KEY = "guild_join_count";
const GUILD_LEAVE_KEY = "guild_leave_count";
const LINK_ADD_KEY = "link_add_count";
const LINK_REMOVE_KEY = "link_remove_count";
const WATCH_ADD_KEY = "watch_add_count";
const WATCH_REMOVE_KEY = "watch_remove_count";
const POLLER_TICKS_KEY = "poller_ticks";
const POLLER_ALERTS_KEY = "poller_alerts_sent";
const POLLER_ERRORS_KEY = "poller_session_errors";
const DM_FAILURES_KEY = "dm_failures_total";
const API_BOT_KEY = "api_tame_bot";
const API_APP_KEY = "api_tame_app";
const API_PUBLIC_KEY = "api_tame_public";
const API_FAIL_KEY = "api_failures";
const API_24H_KEY = "api_24h";

export function initTelemetryStore(): void {
  db.exec(`
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

  if (getCounter(SESSION_KEY) === 0) {
    setCounter(SESSION_KEY, Date.now());
  }
  bumpCounter(SESSION_COUNT_KEY);
}

const getCounterStmt = db.query("SELECT value FROM telemetry_kv WHERE key = ?");
const upsertCounterStmt = db.query(
  "INSERT INTO telemetry_kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
);
const bumpCounterStmt = db.query(
  "INSERT INTO telemetry_kv (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1",
);

export function getCounter(key: string): number {
  const row = getCounterStmt.get(key) as { value: number } | null;
  return Number(row?.value ?? 0);
}

export function setCounter(key: string, value: number): void {
  upsertCounterStmt.run(key, value);
}

export function bumpCounter(key: string, amount = 1): void {
  const current = getCounter(key);
  upsertCounterStmt.run(key, current + amount);
}

export function bumpPeak(key: string, value: number): void {
  const current = getCounter(key);
  if (value > current) setCounter(key, value);
}

const insertAuditStmt = db.query(`
  INSERT INTO command_audit (
    executed_at, interaction_type, command_name, discord_user_id, discord_username,
    guild_id, guild_name, channel_id, options_json, success, error_message, duration_ms
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

export function insertAudit(entry: AuditEntry): number {
  const result = insertAuditStmt.run(
    entry.executedAt,
    entry.interactionType,
    entry.commandName,
    entry.discordUserId,
    entry.discordUsername,
    entry.guildId,
    entry.guildName,
    entry.channelId,
    entry.optionsJson ? JSON.stringify(entry.optionsJson) : null,
    entry.success ? 1 : 0,
    entry.errorMessage,
    entry.durationMs,
  );
  return Number(result.lastInsertRowid);
}

export function getUnsyncedAudit(limit = 100): Array<AuditEntry & { id: number }> {
  const rows = db
    .query(
      `SELECT id, executed_at, interaction_type, command_name, discord_user_id, discord_username,
              guild_id, guild_name, channel_id, options_json, success, error_message, duration_ms
       FROM command_audit WHERE synced_at IS NULL ORDER BY id ASC LIMIT ?`,
    )
    .all(limit) as Array<{
    id: number;
    executed_at: number;
    interaction_type: InteractionKind;
    command_name: string;
    discord_user_id: string;
    discord_username: string | null;
    guild_id: string | null;
    guild_name: string | null;
    channel_id: string | null;
    options_json: string | null;
    success: number;
    error_message: string | null;
    duration_ms: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    executedAt: row.executed_at,
    interactionType: row.interaction_type,
    commandName: row.command_name,
    discordUserId: row.discord_user_id,
    discordUsername: row.discord_username,
    guildId: row.guild_id,
    guildName: row.guild_name,
    channelId: row.channel_id,
    optionsJson: row.options_json ? (JSON.parse(row.options_json) as Record<string, unknown>) : null,
    success: row.success === 1,
    errorMessage: row.error_message,
    durationMs: row.duration_ms,
  }));
}

export function markAuditSynced(ids: number[]): void {
  if (ids.length === 0) return;
  const now = Date.now();
  const placeholders = ids.map(() => "?").join(",");
  db.query(`UPDATE command_audit SET synced_at = ? WHERE id IN (${placeholders})`).run(now, ...ids);
}

export function pruneOldAudit(retentionDays = 90): number {
  const cutoff = Date.now() - retentionDays * 86_400_000;
  const result = db.query("DELETE FROM command_audit WHERE executed_at < ? AND synced_at IS NOT NULL").run(cutoff);
  return result.changes;
}

type AuditAggRow = {
  command_name: string;
  cnt: number;
  failures: number;
  avg_ms: number;
};

type UserAggRow = { discord_user_id: string; discord_username: string | null; cnt: number };
type GuildAggRow = { guild_id: string; guild_name: string | null; cnt: number };
type HourAggRow = { bucket: string; cnt: number };
type LastRow = {
  executed_at: number;
  interaction_type: InteractionKind;
  command_name: string;
  discord_user_id: string;
  discord_username: string | null;
  guild_id: string | null;
  guild_name: string | null;
  channel_id: string | null;
  options_json: string | null;
  success: number;
  error_message: string | null;
  duration_ms: number;
};

export function buildTelemetrySnapshot(): TelemetrySnapshot {
  const now = Date.now();
  const h24 = now - 86_400_000;
  const h1 = now - 3_600_000;
  const d7 = now - 7 * 86_400_000;

  const totals = db
    .query(
      `SELECT
         count(*) AS total,
         sum(CASE WHEN executed_at >= ? THEN 1 ELSE 0 END) AS last24h,
         sum(CASE WHEN executed_at >= ? THEN 1 ELSE 0 END) AS lastHour,
         sum(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failures,
         sum(CASE WHEN success = 0 AND executed_at >= ? THEN 1 ELSE 0 END) AS failures24h,
         sum(CASE WHEN interaction_type = 'autocomplete' THEN 1 ELSE 0 END) AS autocomplete,
         sum(CASE WHEN interaction_type = 'button' THEN 1 ELSE 0 END) AS buttons,
         sum(CASE WHEN interaction_type = 'slash' THEN 1 ELSE 0 END) AS slash,
         avg(duration_ms) AS avg_ms
       FROM command_audit`,
    )
    .get(h24, h1, h24) as {
    total: number;
    last24h: number;
    lastHour: number;
    failures: number;
    failures24h: number;
    autocomplete: number;
    buttons: number;
    slash: number;
    avg_ms: number | null;
  };

  const topCommands = db
    .query(
      `SELECT command_name, count(*) AS cnt,
              sum(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failures,
              avg(duration_ms) AS avg_ms
       FROM command_audit WHERE executed_at >= ?
       GROUP BY command_name ORDER BY cnt DESC LIMIT 15`,
    )
    .all(h24) as AuditAggRow[];

  const topUsers = db
    .query(
      `SELECT discord_user_id, max(discord_username) AS discord_username, count(*) AS cnt
       FROM command_audit WHERE executed_at >= ?
       GROUP BY discord_user_id ORDER BY cnt DESC LIMIT 15`,
    )
    .all(h24) as UserAggRow[];

  const topGuilds = db
    .query(
      `SELECT guild_id, max(guild_name) AS guild_name, count(*) AS cnt
       FROM command_audit WHERE executed_at >= ? AND guild_id IS NOT NULL
       GROUP BY guild_id ORDER BY cnt DESC LIMIT 15`,
    )
    .all(h24) as GuildAggRow[];

  const unique24h =
    (
      db
        .query("SELECT count(DISTINCT discord_user_id) AS cnt FROM command_audit WHERE executed_at >= ?")
        .get(h24) as { cnt: number }
    ).cnt ?? 0;

  const unique7d =
    (
      db
        .query("SELECT count(DISTINCT discord_user_id) AS cnt FROM command_audit WHERE executed_at >= ?")
        .get(d7) as { cnt: number }
    ).cnt ?? 0;

  const commandsByHour = db
    .query(
      `SELECT strftime('%Y-%m-%dT%H:00', executed_at / 1000, 'unixepoch') AS bucket, count(*) AS cnt
       FROM command_audit WHERE executed_at >= ?
       GROUP BY bucket ORDER BY bucket ASC`,
    )
    .all(h24) as HourAggRow[];

  const commandsByDay = db
    .query(
      `SELECT strftime('%Y-%m-%d', executed_at / 1000, 'unixepoch') AS bucket, count(*) AS cnt
       FROM command_audit WHERE executed_at >= ?
       GROUP BY bucket ORDER BY bucket ASC`,
    )
    .all(d7) as HourAggRow[];

  const avgLatencyByCommand = db
    .query(
      `SELECT command_name, avg(duration_ms) AS avg_ms
       FROM command_audit WHERE executed_at >= ?
       GROUP BY command_name ORDER BY avg_ms DESC LIMIT 15`,
    )
    .all(h24) as Array<{ command_name: string; avg_ms: number }>;

  const lastRow = db
    .query(
      `SELECT executed_at, interaction_type, command_name, discord_user_id, discord_username,
              guild_id, guild_name, channel_id, options_json, success, error_message, duration_ms
       FROM command_audit ORDER BY id DESC LIMIT 1`,
    )
    .get() as LastRow | null;

  const total = Number(totals.total ?? 0);
  const failures = Number(totals.failures ?? 0);

  return {
    commandsTotal: total,
    commands24h: Number(totals.last24h ?? 0),
    commandsLastHour: Number(totals.lastHour ?? 0),
    failedCommandsTotal: failures,
    failedCommands24h: Number(totals.failures24h ?? 0),
    autocompleteTotal: Number(totals.autocomplete ?? 0),
    buttonClicksTotal: Number(totals.buttons ?? 0),
    interactionTypes: {
      slash: Number(totals.slash ?? 0),
      autocomplete: Number(totals.autocomplete ?? 0),
      button: Number(totals.buttons ?? 0),
    },
    commandsByHour: commandsByHour.map((r) => ({ hour: r.bucket, count: r.cnt })),
    commandsByDay: commandsByDay.map((r) => ({ day: r.bucket, count: r.cnt })),
    topCommands: topCommands.map((r) => ({
      name: r.command_name,
      count: r.cnt,
      failures: r.failures,
      avgDurationMs: Math.round(r.avg_ms ?? 0),
      errorRate: r.cnt > 0 ? r.failures / r.cnt : 0,
    })),
    topUsers: topUsers.map((r) => ({
      userId: r.discord_user_id,
      username: r.discord_username,
      count: r.cnt,
    })),
    topGuilds: topGuilds.map((r) => ({
      guildId: r.guild_id,
      name: r.guild_name,
      count: r.cnt,
    })),
    uniqueUsers24h: unique24h,
    uniqueUsers7d: unique7d,
    errorRateOverall: total > 0 ? failures / total : 0,
    avgLatencyMs: Math.round(totals.avg_ms ?? 0),
    avgLatencyByCommand: avgLatencyByCommand.map((r) => ({
      name: r.command_name,
      avgMs: Math.round(r.avg_ms ?? 0),
    })),
    lastCommand: lastRow
      ? {
          executedAt: lastRow.executed_at,
          interactionType: lastRow.interaction_type,
          commandName: lastRow.command_name,
          discordUserId: lastRow.discord_user_id,
          discordUsername: lastRow.discord_username,
          guildId: lastRow.guild_id,
          guildName: lastRow.guild_name,
          channelId: lastRow.channel_id,
          optionsJson: lastRow.options_json
            ? (JSON.parse(lastRow.options_json) as Record<string, unknown>)
            : null,
          success: lastRow.success === 1,
          errorMessage: lastRow.error_message,
          durationMs: lastRow.duration_ms,
        }
      : null,
    guildJoinCount: getCounter(GUILD_JOIN_KEY),
    guildLeaveCount: getCounter(GUILD_LEAVE_KEY),
    linkAddCount: getCounter(LINK_ADD_KEY),
    linkRemoveCount: getCounter(LINK_REMOVE_KEY),
    watchAddCount: getCounter(WATCH_ADD_KEY),
    watchRemoveCount: getCounter(WATCH_REMOVE_KEY),
    sessionStartedAt: getCounter(SESSION_KEY),
    sessionCount: getCounter(SESSION_COUNT_KEY),
    peakMemoryMb: getCounter(PEAK_MEMORY_KEY),
    peakHeapMb: getCounter(PEAK_HEAP_KEY),
    peakGuildCount: getCounter(PEAK_GUILDS_KEY),
    apiCalls: {
      tameBot: getCounter(API_BOT_KEY),
      tameApp: getCounter(API_APP_KEY),
      tamePublic: getCounter(API_PUBLIC_KEY),
      total: getCounter(API_BOT_KEY) + getCounter(API_APP_KEY) + getCounter(API_PUBLIC_KEY),
      failures: getCounter(API_FAIL_KEY),
      last24h: getCounter(API_24H_KEY),
    },
    pollerTicks: getCounter(POLLER_TICKS_KEY),
    pollerAlertsSent: getCounter(POLLER_ALERTS_KEY),
    pollerSessionErrors: getCounter(POLLER_ERRORS_KEY),
    dmFailuresTotal: getCounter(DM_FAILURES_KEY),
  };
}

export const telemetryCounters = {
  guildJoin: () => bumpCounter(GUILD_JOIN_KEY),
  guildLeave: () => bumpCounter(GUILD_LEAVE_KEY),
  linkAdd: () => bumpCounter(LINK_ADD_KEY),
  linkRemove: () => bumpCounter(LINK_REMOVE_KEY),
  watchAdd: () => bumpCounter(WATCH_ADD_KEY),
  watchRemove: () => bumpCounter(WATCH_REMOVE_KEY),
  pollerTick: () => bumpCounter(POLLER_TICKS_KEY),
  pollerAlert: () => bumpCounter(POLLER_ALERTS_KEY),
  pollerSessionError: () => bumpCounter(POLLER_ERRORS_KEY),
  dmFailure: () => bumpCounter(DM_FAILURES_KEY),
  apiCall: (kind: "bot" | "app" | "public", failed = false) => {
    if (kind === "bot") bumpCounter(API_BOT_KEY);
    else if (kind === "app") bumpCounter(API_APP_KEY);
    else bumpCounter(API_PUBLIC_KEY);
    bumpCounter(API_24H_KEY);
    if (failed) bumpCounter(API_FAIL_KEY);
  },
  updatePeaks: (rssMb: number, heapMb: number, guildCount: number) => {
    bumpPeak(PEAK_MEMORY_KEY, rssMb);
    bumpPeak(PEAK_HEAP_KEY, heapMb);
    bumpPeak(PEAK_GUILDS_KEY, guildCount);
  },
};
