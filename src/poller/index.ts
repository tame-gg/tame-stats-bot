import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  type GuildTextBasedChannel,
} from "discord.js";
import { TameApiError, tame, type HypixelSession } from "../api/tame.ts";
import { getDistinctWatchedPlayers, getGuildConfigsWithAlerts, getWatchersForUuid } from "../db.ts";
import { THEME, themeAuthor, themeFooter } from "../embeds/theme.ts";
import { log } from "../log.ts";
import { compactSession, mapLimit } from "../util.ts";
import { POLLER_CONSTANTS, pollerState } from "./state.ts";

let scheduled: ReturnType<typeof setTimeout> | null = null;
let stopped = false;

function cameOnline(previous: HypixelSession | undefined, next: HypixelSession): boolean {
  return !!previous && previous.online === false && next.online === true;
}

function shouldSuppressAlert(uuid: string, userId: string, now: number): boolean {
  const key = `${uuid}:${userId}`;
  const last = pollerState.lastAlertAt.get(key);
  if (last !== undefined && now - last < POLLER_CONSTANTS.ALERT_DEDUP_MS) return true;
  return false;
}

function recordAlert(uuid: string, userId: string, now: number): void {
  pollerState.lastAlertAt.set(`${uuid}:${userId}`, now);
}

function isUserDmLocked(userId: string, now: number): boolean {
  const entry = pollerState.dmFailures.get(userId);
  if (!entry) return false;
  return entry.lockedUntil > now;
}

function recordDmFailure(userId: string, now: number): void {
  const existing = pollerState.dmFailures.get(userId) ?? { count: 0, lockedUntil: 0 };
  existing.count += 1;
  if (existing.count >= POLLER_CONSTANTS.DM_FAIL_THRESHOLD) {
    existing.lockedUntil = now + POLLER_CONSTANTS.DM_LOCKOUT_MS;
    log.warn(
      { userId, failures: existing.count, lockedUntil: existing.lockedUntil },
      "DM cooldown engaged for user",
    );
  }
  pollerState.dmFailures.set(userId, existing);
}

function recordDmSuccess(userId: string): void {
  pollerState.dmFailures.delete(userId);
}

/**
 * Watcher DM (and guild-channel mirror) alert embed. Player-focused →
 * gold sidebar, `tame.gg / now online` author eyebrow, italic single-line
 * description. The embed shell stays monochrome; the gold sidebar is the
 * only color cue, matching the rest of the player-focused embeds.
 */
function buildAlertEmbed(ign: string, session: HypixelSession): EmbedBuilder {
  // `compactSession` returns "Online" when there's no gameType/mode info,
  // and "Bedwars · Doubles · …" when there is. Keep its capitalization —
  // game/mode names are proper nouns and lowercasing reads as a bug.
  const detail = compactSession(session);
  const description = detail !== "Online"
    ? `*Just logged on — playing ${detail}.*`
    : `*Just logged on.*`;
  return new EmbedBuilder()
    .setAuthor(themeAuthor("now online"))
    .setTitle(ign)
    .setURL(tame.liveUrl(ign))
    .setColor(THEME.accent)
    .setDescription(description)
    .setFooter(themeFooter(`${ign}/live`));
}

function buildAlertRow(ign: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setLabel("Open live tracker").setStyle(ButtonStyle.Link).setURL(tame.liveUrl(ign)),
    new ButtonBuilder().setLabel("Profile").setStyle(ButtonStyle.Link).setURL(tame.playerUrl(ign)),
  );
}

async function tryGuildChannelAlert(
  client: Client,
  discordUserId: string,
  ign: string,
  session: HypixelSession,
): Promise<boolean> {
  const configs = getGuildConfigsWithAlerts();
  const embed = buildAlertEmbed(ign, session);
  const row = buildAlertRow(ign);
  for (const config of configs) {
    if (!config.alert_channel_id) continue;
    const guild = client.guilds.cache.get(config.guild_id);
    if (!guild) continue;
    const member = await guild.members.fetch(discordUserId).catch(() => null);
    if (!member) continue;
    const channel = await client.channels.fetch(config.alert_channel_id).catch(() => null);
    if (!channel) continue;
    if (
      channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement &&
      channel.type !== ChannelType.PublicThread &&
      channel.type !== ChannelType.PrivateThread
    ) {
      continue;
    }
    try {
      await (channel as GuildTextBasedChannel).send({ embeds: [embed], components: [row] });
      return true;
    } catch (err) {
      log.warn(
        { err, guildId: config.guild_id, channelId: config.alert_channel_id },
        "guild alert send failed",
      );
    }
  }
  return false;
}

async function tryDmAlert(
  client: Client,
  discordUserId: string,
  ign: string,
  session: HypixelSession,
  now: number,
): Promise<boolean> {
  if (isUserDmLocked(discordUserId, now)) {
    log.debug({ userId: discordUserId }, "DM skipped — user is in cooldown");
    return false;
  }
  const user = await client.users.fetch(discordUserId).catch(() => null);
  if (!user) {
    recordDmFailure(discordUserId, now);
    return false;
  }
  try {
    await user.send({ embeds: [buildAlertEmbed(ign, session)], components: [buildAlertRow(ign)] });
    recordDmSuccess(discordUserId);
    return true;
  } catch (err) {
    recordDmFailure(discordUserId, now);
    log.debug({ err, userId: discordUserId }, "DM send failed");
    return false;
  }
}

async function notifyWatcher(
  client: Client,
  discordUserId: string,
  ign: string,
  session: HypixelSession,
  now: number,
): Promise<boolean> {
  if (await tryGuildChannelAlert(client, discordUserId, ign, session)) return true;
  return tryDmAlert(client, discordUserId, ign, session, now);
}

type FetchedSession = {
  player: { uuid: string; ign: string };
  session: HypixelSession;
  ok: boolean;
};

async function fetchAllSessions(
  watched: ReadonlyArray<{ uuid: string; ign: string }>,
): Promise<FetchedSession[]> {
  return mapLimit(watched, 5, async (player): Promise<FetchedSession> => {
    try {
      const session = await tame.session(player.uuid);
      return { player, session, ok: true };
    } catch (err) {
      if (err instanceof TameApiError) {
        // Don't churn the alert state on transient errors — treat as offline
        // and mark the call as failed so the backoff logic can act.
        log.debug({ err, uuid: player.uuid, kind: err.kind }, "session fetch failed");
      } else {
        log.warn({ err, uuid: player.uuid }, "unexpected session fetch error");
      }
      return { player, session: { online: false }, ok: false };
    }
  });
}

function applyBackoff(failureRatio: number): void {
  if (failureRatio > POLLER_CONSTANTS.BAD_TICK_FAIL_RATIO) {
    pollerState.backoff.consecutiveBadTicks += 1;
    pollerState.backoff.intervalMs = Math.min(
      pollerState.backoff.intervalMs * 2,
      POLLER_CONSTANTS.MAX_INTERVAL_MS,
    );
    log.warn(
      {
        failureRatio,
        consecutive: pollerState.backoff.consecutiveBadTicks,
        nextIntervalMs: pollerState.backoff.intervalMs,
      },
      "poller backing off",
    );
  } else if (pollerState.backoff.intervalMs !== POLLER_CONSTANTS.BASE_INTERVAL_MS) {
    log.info("poller recovered, resetting interval");
    pollerState.backoff.consecutiveBadTicks = 0;
    pollerState.backoff.intervalMs = POLLER_CONSTANTS.BASE_INTERVAL_MS;
  }
}

function checkWatchedRosterSize(count: number): void {
  if (count >= POLLER_CONSTANTS.WATCHED_ALERT) {
    log.error({ count }, "watched UUID roster exceeds alert threshold");
  } else if (count >= POLLER_CONSTANTS.WATCHED_WARN) {
    log.warn({ count }, "watched UUID roster exceeds warn threshold");
  }
}

export async function tick(client: Client): Promise<void> {
  const startedAt = performance.now();
  const watched = getDistinctWatchedPlayers();
  checkWatchedRosterSize(watched.length);

  if (watched.length === 0) {
    pollerState.firstTickComplete = true;
    pollerState.lastTickAt = Date.now();
    return;
  }

  const fetched = await fetchAllSessions(watched);
  const failures = fetched.filter((r) => !r.ok).length;
  const failureRatio = failures / fetched.length;

  if (!pollerState.firstTickComplete) {
    log.info(
      { watched: watched.length, failures, durationMs: Math.round(performance.now() - startedAt) },
      "first tick — populating baseline",
    );
    for (const { player, session } of fetched) {
      pollerState.lastKnown.set(player.uuid, session);
    }
    pollerState.firstTickComplete = true;
    pollerState.lastTickAt = Date.now();
    applyBackoff(failureRatio);
    return;
  }

  const now = Date.now();
  let alertsSent = 0;
  for (const { player, session, ok } of fetched) {
    const previous = pollerState.lastKnown.get(player.uuid);
    // Don't trigger an alert from a known-bad fetch — without `ok`, `session`
    // is the synthetic `{ online: false }` we substituted, which would create
    // a false offline edge that the next successful fetch then "restores".
    if (ok && cameOnline(previous, session)) {
      const watchers = getWatchersForUuid(player.uuid);
      for (const watcher of watchers) {
        if (shouldSuppressAlert(player.uuid, watcher.discord_user_id, now)) {
          log.debug(
            { uuid: player.uuid, userId: watcher.discord_user_id },
            "alert suppressed by dedup",
          );
          continue;
        }
        const sent = await notifyWatcher(
          client,
          watcher.discord_user_id,
          watcher.ign,
          session,
          now,
        );
        if (sent) {
          recordAlert(player.uuid, watcher.discord_user_id, now);
          alertsSent += 1;
          log.info(
            {
              uuid: player.uuid,
              ign: watcher.ign,
              userId: watcher.discord_user_id,
              gameType: session.gameType ?? null,
            },
            "alert delivered",
          );
        }
      }
    }
    if (ok) pollerState.lastKnown.set(player.uuid, session);
  }

  applyBackoff(failureRatio);
  pollerState.lastTickAt = Date.now();

  log.info(
    {
      watched: watched.length,
      failures,
      alertsSent,
      durationMs: Math.round(performance.now() - startedAt),
      nextIntervalMs: pollerState.backoff.intervalMs,
    },
    "poller tick complete",
  );
}

function scheduleNext(client: Client): void {
  if (stopped) return;
  scheduled = setTimeout(() => {
    runOneTick(client);
  }, pollerState.backoff.intervalMs);
}

function runOneTick(client: Client): void {
  if (stopped) return;
  const promise = tick(client).catch((err) => {
    log.error({ err }, "poller tick failed");
  });
  pollerState.inFlightTick = promise.finally(() => {
    pollerState.inFlightTick = null;
    scheduleNext(client);
  });
}

export function startPoller(client: Client): void {
  if (scheduled || pollerState.inFlightTick) return;
  stopped = false;
  log.info("starting watchlist poller");
  runOneTick(client);
}

export function stopPoller(): void {
  stopped = true;
  if (scheduled) {
    clearTimeout(scheduled);
    scheduled = null;
  }
  log.info("watchlist poller stopped");
}

/**
 * Eagerly seed `lastKnown` for a UUID by fetching its current Hypixel
 * session right now. Without this, /watch only baselines on the next
 * scheduled tick (~60s lag), and the first online-edge after baseline
 * needs *another* tick after that — total ~2 minutes from /watch to
 * first alert. With this, baseline is instant and the very next tick
 * can fire.
 *
 * Errors are swallowed — the regular tick will retry the fetch.
 */
export async function seedWatchedPlayer(uuid: string): Promise<HypixelSession | null> {
  try {
    const session = await tame.session(uuid);
    pollerState.lastKnown.set(uuid, session);
    return session;
  } catch (err) {
    log.debug({ err, uuid }, "seedWatchedPlayer failed (will retry on next tick)");
    return null;
  }
}

/**
 * Resolves once the currently running tick (if any) has finished, or after
 * `timeoutMs` — whichever is first. Used by graceful shutdown so the bot
 * doesn't kill itself mid-DM-send.
 */
export async function waitForInflightTick(timeoutMs: number): Promise<void> {
  const inflight = pollerState.inFlightTick;
  if (!inflight) return;
  if (timeoutMs <= 0) return;
  await Promise.race([
    inflight,
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}
