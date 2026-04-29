import { EmbedBuilder } from "discord.js";
import type { HypixelSession, PlayerPreview, PreviewMetric } from "../api/tame.ts";
import { tame } from "../api/tame.ts";
import { compactSession, formatNumber } from "../util.ts";
import { rankSidebar, themeAuthor, themeFooter } from "./theme.ts";

function findMetric(preview: PlayerPreview, gameId: string, key: string): PreviewMetric | null {
  const game = preview.games.find((g) => g.id === gameId);
  return game?.metrics.find((m) => m.key === key) ?? null;
}

function metricStr(metric: PreviewMetric | null): string {
  return metric && metric.value !== null ? formatNumber(metric.value, metric.digits) : "—";
}

/**
 * `/stats <ign>` — the headline embed. The OG card carries the actual stats
 * (FKDR / WLR / Final Kills / Wins as four tiles); the embed text is
 * deliberately spare so it doesn't compete with the image. Surfaces only:
 *
 *   - rank-tier or gold sidebar (the player IS the focus)
 *   - `tame.gg / bedwars` author eyebrow
 *   - `<rank> <ign>` title
 *   - one italic line for live session state (or "Last seen offline.")
 *   - one mono "FKDR · WLR" row for screen-readers / clients that don't
 *     render the OG image inline
 *   - the OG card itself via setImage()
 *   - footer `stats.tame.gg/<ign>` + favicon
 */
export function buildPlayerEmbed(preview: PlayerPreview, session: HypixelSession | null): EmbedBuilder {
  const ign = preview.ign;
  const rankPrefix = preview.rank?.label ? `${preview.rank.label} ` : "";

  const fkdr = findMetric(preview, "bedwars", "fkdr");
  const wlr = findMetric(preview, "bedwars", "wlr");
  const star = findMetric(preview, "bedwars", "star");

  const title = `${rankPrefix}${ign}`;
  const description = session?.online
    ? `*Online — ${compactSession(session)}.*`
    : `*Last seen offline.*`;

  // Single mono row of headline metrics. inline-code on values per the
  // visual rules: the embed shell stays monochrome, the OG card is where
  // chromatic accents live.
  const metricLine = [
    `FKDR \`${metricStr(fkdr)}\``,
    `WLR \`${metricStr(wlr)}\``,
    star && star.value !== null ? `★ \`${formatNumber(star.value, 0)}\`` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");

  return new EmbedBuilder()
    .setAuthor(themeAuthor("bedwars"))
    .setTitle(title)
    .setURL(tame.playerUrl(ign))
    .setColor(rankSidebar(preview.rank?.key))
    .setDescription(`${description}\n${metricLine}`)
    .setImage(tame.ogPlayer(ign))
    .setFooter(themeFooter(ign));
}
