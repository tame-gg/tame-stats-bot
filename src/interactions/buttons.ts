import { type ButtonInteraction, MessageFlags } from "discord.js";
import { tame, type BedwarsMode, type HypixelSession } from "../api/tame.ts";
import { buildBedwarsModeRows } from "../commands/games.ts";
import { renderLeaderboard } from "../commands/leaderboard.ts";
import { buildGameEmbed } from "../embeds/game.ts";
import { log } from "../log.ts";

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

/**
 * Resolve the user id of whoever ran the slash command that produced this
 * message. discord.js v14.18 deprecated `Message.interaction` in favour of
 * `Message.interactionMetadata` — try the new field first, fall back to
 * the legacy one. Returns null if neither is set (extremely rare; the
 * message wasn't produced by an interaction at all).
 */
function originalInvokerId(interaction: ButtonInteraction): string | null {
  const meta = interaction.message.interactionMetadata;
  if (meta && "user" in meta && meta.user) return meta.user.id;
  const legacy = interaction.message.interaction;
  if (legacy?.user) return legacy.user.id;
  return null;
}

/**
 * Reject clicks from anyone but the user who ran the slash command that
 * produced this message. Returns true when the click came from the
 * original invoker (or we couldn't determine — fail open rather than
 * locking everyone out on a discord.js field rename).
 */
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

/**
 * `/bedwars` mode-selector button click. Re-fetches the player's preview
 * via `tame.preview(uuid)` (no API-client bypass — the dispatcher reuses
 * the same client the slash command does) and re-renders the embed for
 * the requested mode, swapping the pressed button to Primary.
 */
async function handleBedwarsModeClick(interaction: ButtonInteraction): Promise<void> {
  // customId shape: `bw:mode:<uuid>:<mode>`. UUIDs are dashed (36 chars,
  // no colons internally) so the four-part split is unambiguous.
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

  // deferUpdate first so the click doesn't time out while we re-fetch —
  // Discord gives us 3s to acknowledge, network round-trips can blow that
  // budget on a cold preview cache.
  await interaction.deferUpdate();

  const preview = await tame.preview(uuid);
  if (!preview) {
    await interaction.followUp({
      content: "Couldn't fetch updated stats — try `/bedwars <ign>` again.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Session is informational only — failure shouldn't block the embed swap.
  const session: HypixelSession = await tame
    .session(uuid)
    .catch(() => ({ online: false }) as const);

  const embed = buildGameEmbed(preview, "bedwars", "Bedwars", session, mode);
  await interaction.editReply({
    embeds: [embed],
    components: buildBedwarsModeRows(uuid, mode),
  });
}

/**
 * `/leaderboard` game-selector button click. Re-runs the same leaderboard
 * query for the requested game, preserving the metric the user originally
 * picked (encoded in the customId).
 */
async function handleLeaderboardGameClick(interaction: ButtonInteraction): Promise<void> {
  // customId shape: `lb:game:<game>:<metric>`. Game ids are snake_case
  // (e.g. `murder_mystery`) and metric keys are camelCase (e.g. `finalKills`)
  // — neither contains colons, so the four-part split is unambiguous.
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

/**
 * Single button dispatcher. Switches on the `customId` prefix and routes
 * to the per-feature handler. Unknown prefixes are ignored — Discord
 * delivers stale customIds from old messages and we don't want to spam
 * the channel with "unknown button" replies.
 */
export async function dispatchButton(interaction: ButtonInteraction): Promise<void> {
  if (!(await ensureInvoker(interaction))) return;

  const customId = interaction.customId;
  if (customId.startsWith("bw:mode:")) {
    await handleBedwarsModeClick(interaction);
    return;
  }
  if (customId.startsWith("lb:game:")) {
    await handleLeaderboardGameClick(interaction);
    return;
  }

  log.debug({ customId }, "unhandled button click");
}
