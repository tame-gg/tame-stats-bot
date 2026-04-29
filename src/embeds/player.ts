import { EmbedBuilder } from "discord.js";
import type { HypixelSession, PlayerPreview, PreviewMetric } from "../api/tame.ts";
import { tame } from "../api/tame.ts";
import { compactSession, formatNumber } from "../util.ts";

/**
 * Curated embed accents per rank tier — these aren't the in-game prefix
 * colors (those are too saturated for a Discord sidebar). Default to a warm
 * gold that matches stats.tame.gg's branding for unranked / staff / unknown.
 */
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

function findMetric(preview: PlayerPreview, gameId: string, key: string): PreviewMetric | null {
  const game = preview.games.find((g) => g.id === gameId);
  return game?.metrics.find((m) => m.key === key) ?? null;
}

function metricField(name: string, metric: PreviewMetric | null) {
  return {
    name,
    value: metric && metric.value !== null ? formatNumber(metric.value, metric.digits) : "—",
    inline: true,
  };
}

export function buildPlayerEmbed(preview: PlayerPreview, session: HypixelSession | null): EmbedBuilder {
  const ign = preview.ign;
  // Title: `<ign> · ✦ <netLevel>`. Network level is `null` only when there's
  // no snapshot yet — drop the star+number and just show the IGN.
  const title =
    preview.networkLevel !== null
      ? `${ign} · ✦ ${Math.floor(preview.networkLevel).toLocaleString("en-US")}`
      : ign;

  const fkdr = findMetric(preview, "bedwars", "fkdr");
  const wlr = findMetric(preview, "bedwars", "wlr");
  const star = findMetric(preview, "bedwars", "star");
  const finalKills = findMetric(preview, "bedwars", "finalKills");
  const wins = findMetric(preview, "bedwars", "wins");

  return new EmbedBuilder()
    .setTitle(title)
    .setURL(tame.playerUrl(ign))
    .setColor(colorForRank(preview.rank?.key))
    .setImage(tame.ogPlayer(ign))
    .addFields(
      metricField("FKDR", fkdr),
      metricField("WLR", wlr),
      metricField("★ Star", star),
      metricField("Final Kills", finalKills),
      metricField("Wins", wins),
      { name: "Online", value: compactSession(session), inline: true },
    )
    .setFooter({ text: `stats.tame.gg/${ign}`, iconURL: tame.faviconUrl() });
}
