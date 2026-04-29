import { EmbedBuilder } from "discord.js";
import type { HypixelSession, PlayerPreview } from "../api/tame.ts";
import { tame } from "../api/tame.ts";
import { compactSession, formatNumber } from "../util.ts";

const RANK_GOLD = 0xe8b84a;
const RANK_AQUA = 0x55ffff;
const RANK_GREEN = 0x6ccb5f;

function colorForRank(key: string | undefined): number {
  switch (key) {
    case "MVP_PLUS_PLUS":
    case "MVP_PLUS":
      return RANK_GOLD;
    case "MVP":
      return RANK_AQUA;
    case "VIP_PLUS":
    case "VIP":
      return RANK_GREEN;
    default:
      return RANK_GOLD;
  }
}

/**
 * Per-game stats embed. Renders whatever metrics the API returns for the
 * given gameId — no hard-coded metric lists per game, so adding a new
 * field on the website preview surfaces here for free.
 */
export function buildGameEmbed(
  preview: PlayerPreview,
  gameId: string,
  gameLabel: string,
  session: HypixelSession | null,
): EmbedBuilder {
  const ign = preview.ign;
  const game = preview.games.find((g) => g.id === gameId);

  const embed = new EmbedBuilder()
    .setTitle(`${ign} · ${gameLabel}`)
    .setURL(tame.playerUrl(ign))
    .setColor(colorForRank(preview.rank?.key))
    .setImage(tame.ogPlayer(ign))
    .setFooter({ text: `stats.tame.gg/${ign}`, iconURL: tame.faviconUrl() });

  if (!game || !game.hasPlayed) {
    embed.setDescription(
      `**${ign}** has no ${gameLabel} stats — either they haven't played, or their Hypixel API setting is off.`,
    );
    return embed;
  }

  const fields = game.metrics.map((m) => ({
    name: m.label,
    value: m.value !== null ? formatNumber(m.value, m.digits) : "—",
    inline: true,
  }));

  // Surface the live session at the bottom if they're online — saves a
  // separate /stats roundtrip for "are they on right now".
  if (session?.online) {
    fields.push({ name: "Currently", value: compactSession(session), inline: false });
  }

  embed.addFields(fields);
  return embed;
}

/**
 * Network-level overview embed used by /hypixel. Distinct from the per-game
 * embeds — focuses on the player's overall Hypixel profile (rank tier,
 * network level, games-played counts) rather than any single game's metrics.
 */
export function buildHypixelOverviewEmbed(
  preview: PlayerPreview,
  session: HypixelSession | null,
): EmbedBuilder {
  const ign = preview.ign;
  const level = preview.networkLevel !== null
    ? Math.floor(preview.networkLevel).toLocaleString("en-US")
    : "?";

  const playedGames = preview.games.filter((g) => g.hasPlayed);

  const embed = new EmbedBuilder()
    .setTitle(`${ign} · ✦ ${level}`)
    .setURL(tame.playerUrl(ign))
    .setColor(colorForRank(preview.rank?.key))
    .setImage(tame.ogPlayer(ign))
    .addFields(
      { name: "Rank", value: preview.rank?.label ?? "—", inline: true },
      { name: "Network Level", value: level, inline: true },
      { name: "Games Played", value: `${playedGames.length} of ${preview.games.length}`, inline: true },
      {
        name: "Currently",
        value: compactSession(session),
        inline: false,
      },
    )
    .setFooter({ text: `stats.tame.gg/${ign}`, iconURL: tame.faviconUrl() });

  if (playedGames.length > 0) {
    embed.addFields({
      name: "Modes Tracked",
      value: playedGames.map((g) => g.label).join(" · "),
      inline: false,
    });
  }

  return embed;
}
