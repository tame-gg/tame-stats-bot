import { type ButtonInteraction, EmbedBuilder, MessageFlags } from "discord.js";
import { tame, type BedwarsMode, type HypixelSession } from "../api/tame.ts";
import { extendWatch, getWatch, touchWatchRefresh } from "../db.ts";
import { THEME, themeAuthor, themeFooter } from "../embeds/theme.ts";
import { buildBedwarsModeRows } from "../commands/games.ts";
import { renderLeaderboard } from "../commands/leaderboard.ts";
import { renderGlobalLeaderboard } from "../commands/globallb.ts";
import { buildBedwarsStatsReply } from "../images/stats-reply.ts";
import { describeSessionActivity, seedWatchedPlayer } from "../poller/index.ts";
import { log } from "../log.ts";
import { buildWatchAlertRow } from "../watch/components.ts";
import { WATCH_REFRESH_COOLDOWN_MS } from "../watch/constants.ts";

const BEDWARS_MODES: ReadonlySet<BedwarsMode> = new Set([
  "overall",
  "solo",
  "doubles",
  "trios",
  "fours",
  "dreams",
]);

function isBedwarsMode(value: string | undefined): value is BedwarsMode {
  return value !== undefined && BEDWARS_MODES.has(value as BedwarsMode);
}

function originalInvokerId(interaction: ButtonInteraction): string | null {
  const meta = interaction.message.interactionMetadata;
  if (meta && "user" in meta && meta.user) return meta.user.id;
  const legacy = interaction.message.interaction;
  if (legacy?.user) return legacy.user.id;
  return null;
}

async function ensureInvoker(interaction: ButtonInteraction): Promise<boolean> {
  const invokerId = originalInvokerId(interaction);
  if (invokerId && invokerId !== interaction.user.id) {
    await interaction.reply({
      content: "This isn't your interaction.",
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }
  return true;
}

async function handleWatchExtend(interaction: ButtonInteraction, uuid: string): Promise<void> {
  const extended = extendWatch(interaction.user.id, uuid);
  if (!extended) {
    await interaction.reply({
      content: "That watch wasn't found — run `/watch` again to start fresh.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const watch = getWatch(interaction.user.id, uuid);
  await interaction.reply({
    content: watch
      ? `Extended watch on **${watch.ign}** for another 24 hours.`
      : "Watch extended for another 24 hours.",
    flags: MessageFlags.Ephemeral,
  });
}

async function handleWatchRefresh(interaction: ButtonInteraction, uuid: string): Promise<void> {
  const watch = getWatch(interaction.user.id, uuid);
  if (!watch || watch.expires_at <= Date.now()) {
    await interaction.reply({
      content: "You don't have an active watch on that player.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const now = Date.now();
  if (watch.last_refresh_at > 0 && now - watch.last_refresh_at < WATCH_REFRESH_COOLDOWN_MS) {
    const waitSec = Math.ceil((WATCH_REFRESH_COOLDOWN_MS - (now - watch.last_refresh_at)) / 1000);
    await interaction.reply({
      content: `Update cooldown — try again in ${waitSec}s.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  touchWatchRefresh(interaction.user.id, uuid, now);
  const session = await seedWatchedPlayer(uuid).catch(() => null);
  const activity = describeSessionActivity(session ?? { online: false });
  const embed = new EmbedBuilder()
    .setAuthor(themeAuthor("watch · update"))
    .setTitle(watch.ign)
    .setColor(THEME.accent)
    .setDescription(`*${activity}.*`)
    .setFooter(themeFooter(`${watch.ign}/live`));
  await interaction.editReply({
    embeds: [embed],
    components: [buildWatchAlertRow(watch.ign, uuid, tame.liveUrl(watch.ign), tame.playerUrl(watch.ign))],
  });
}

async function handleBedwarsModeClick(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split(":");
  if (parts.length !== 4) {
    log.warn({ customId: interaction.customId }, "malformed bw:mode button");
    return;
  }
  const [, , uuid, modeRaw] = parts;
  if (!uuid || !isBedwarsMode(modeRaw)) {
    log.warn({ customId: interaction.customId }, "unknown bedwars mode in button");
    return;
  }
  const mode = modeRaw;

  await interaction.deferUpdate();

  const preview = await tame.preview(uuid);
  if (!preview) {
    await interaction.followUp({
      content: "Couldn't fetch updated stats — try `/bedwars <ign>` again.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const session: HypixelSession = await tame
    .session(uuid)
    .catch(() => ({ online: false }) as const);

  const reply = await buildBedwarsStatsReply(
    preview,
    session,
    mode,
    buildBedwarsModeRows(uuid, mode),
  );
  await interaction.editReply(reply);
}

async function handleLeaderboardGameClick(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split(":");
  if (parts.length !== 4) {
    log.warn({ customId: interaction.customId }, "malformed lb:game button");
    return;
  }
  const [, , game, metric] = parts;
  if (!game || !metric) {
    log.warn({ customId: interaction.customId }, "missing game/metric in button");
    return;
  }
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: "Leaderboards are server-scoped — run this in a guild.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferUpdate();

  const result = await renderLeaderboard(guildId, game, metric);
  if (result.kind === "empty") {
    await interaction.followUp({ content: result.message, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.editReply({ embeds: [result.embed], components: [result.row] });
}

async function handleGlobalLbGameClick(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split(":");
  if (parts.length !== 4) {
    log.warn({ customId: interaction.customId }, "malformed glb:game button");
    return;
  }
  const [, , game, metric] = parts;
  if (!game || !metric) {
    log.warn({ customId: interaction.customId }, "missing game/metric in glb button");
    return;
  }

  await interaction.deferUpdate();

  const result = await renderGlobalLeaderboard(game, metric, 10);
  if (result.kind === "empty") {
    await interaction.followUp({ content: result.message, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.editReply({ embeds: [result.embed], components: result.rows });
}

export async function dispatchButton(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;

  if (customId.startsWith("watch:extend:")) {
    const uuid = customId.slice("watch:extend:".length);
    if (!uuid) return;
    await handleWatchExtend(interaction, uuid);
    return;
  }

  if (customId.startsWith("watch:refresh:")) {
    const uuid = customId.slice("watch:refresh:".length);
    if (!uuid) return;
    await handleWatchRefresh(interaction, uuid);
    return;
  }

  if (!(await ensureInvoker(interaction))) return;

  if (customId.startsWith("bw:mode:")) {
    await handleBedwarsModeClick(interaction);
    return;
  }
  if (customId.startsWith("lb:game:")) {
    await handleLeaderboardGameClick(interaction);
    return;
  }
  if (customId.startsWith("glb:game:")) {
    await handleGlobalLbGameClick(interaction);
    return;
  }

  log.debug({ customId }, "unhandled button click");
}
