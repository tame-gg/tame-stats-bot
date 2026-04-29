import { EmbedBuilder } from "discord.js";
import type { HypixelSession, PlayerPreview } from "../api/tame.ts";
import { tame } from "../api/tame.ts";
import { compactSession, formatNumber } from "../util.ts";
import {
  THEME,
  avatarUrl,
  rankSidebar,
  ruleField,
  statField,
  themeAuthor,
  themeFooter,
} from "./theme.ts";

/**
 * Headline metrics rendered as the 2-up row at the top of a per-game embed.
 * Anything else falls through to the secondary grid. Order matches the
 * design's eyebrow→name→number scanning rhythm.
 */
const HEADLINE_METRICS: Record<string, [string, string]> = {
  bedwars: ["fkdr", "wlr"],
  skywars: ["kdr", "wlr"],
  duels: ["wlr", "kdr"],
  murder_mystery: ["kdr", "wins"],
  build_battle: ["score", "wins"],
};

/**
 * Per-game stats embed (`/bedwars`, `/skywars`, `/duels`, `/murdermystery`,
 * `/buildbattle`). Different visual rhythm from `/stats`: a small player-head
 * thumbnail (mc-heads.net) instead of the full OG card, then a 2-up headline
 * + n-up secondary metric grid as inline fields.
 *
 * Sidebar defaults to ink; the per-game embeds aren't player-focused (they're
 * stat-focused), so the gold accent is reserved for `/stats`.
 */
export function buildGameEmbed(
  preview: PlayerPreview,
  gameId: string,
  gameLabel: string,
  session: HypixelSession | null,
): EmbedBuilder {
  const ign = preview.ign;
  const game = preview.games.find((g) => g.id === gameId);
  const rankPrefix = preview.rank?.label ? `${preview.rank.label} ` : "";

  const embed = new EmbedBuilder()
    .setAuthor(themeAuthor(`${gameLabel.toLowerCase()} · overall`))
    .setTitle(`${rankPrefix}${ign}`)
    .setURL(tame.playerUrl(ign))
    .setColor(THEME.sidebar)
    .setThumbnail(avatarUrl(preview.uuid))
    .setFooter(themeFooter(`${ign}/${gameId}`));

  if (!game || !game.hasPlayed) {
    embed.setDescription(
      `*No ${gameLabel} stats — either they haven't played, or their Hypixel API setting is off.*`,
    );
    return embed;
  }

  // Online state earns one italic line above the metrics; offline we don't
  // pad — the prompt is explicit about not adding empty editorial copy.
  if (session?.online) {
    embed.setDescription(`*Online — ${compactSession(session)}.*`);
  }

  // Split metrics into headline (the 2-up row) and the rest (the secondary
  // grid). Falls back gracefully when a headline metric is missing — we just
  // don't put it in the top row, the secondary grid still includes it.
  const headlineKeys = HEADLINE_METRICS[gameId] ?? [];
  const headline = headlineKeys
    .map((key) => game.metrics.find((m) => m.key === key))
    .filter((m): m is NonNullable<typeof m> => !!m && m.value !== null);
  const headlineKeySet = new Set(headline.map((m) => m.key));
  const secondary = game.metrics.filter(
    (m) => !headlineKeySet.has(m.key) && m.value !== null,
  );

  const headlineFields = headline.map((m) =>
    statField(m.label.toUpperCase(), formatNumber(m.value as number, m.digits)),
  );
  const secondaryFields = secondary.map((m) =>
    statField(m.label, formatNumber(m.value as number, m.digits)),
  );

  if (headlineFields.length > 0) {
    embed.addFields(headlineFields);
    if (secondaryFields.length > 0) embed.addFields(ruleField());
  }
  if (secondaryFields.length > 0) embed.addFields(secondaryFields);

  return embed;
}

/**
 * `/hypixel` — network-level overview, distinct from `/stats`. Focuses on
 * the Hypixel profile (rank tier, network level, last login, achievements)
 * — never surface Bedwars stats here, that's `/bedwars`'s job.
 *
 * Player-focused → gold (or rank-tier) sidebar, mc-heads thumbnail, no
 * OG image (the page IS the player, but the image is reserved for /stats
 * so this embed doesn't crowd it out when both ship in the same channel).
 */
export function buildHypixelOverviewEmbed(
  preview: PlayerPreview,
  session: HypixelSession | null,
): EmbedBuilder {
  const ign = preview.ign;
  const rankPrefix = preview.rank?.label ? `${preview.rank.label} ` : "";
  const level = preview.networkLevel !== null
    ? Math.floor(preview.networkLevel).toLocaleString("en-US")
    : "?";

  const playedGames = preview.games.filter((g) => g.hasPlayed);

  // Editorial blurb — short and italic. Online state, then the optional
  // tracked-since reference. Offline collapses to a single line.
  const stateLine = session?.online
    ? `*Online — ${compactSession(session)}.*`
    : `*Last seen offline.*`;

  const embed = new EmbedBuilder()
    .setAuthor(themeAuthor("hypixel"))
    .setTitle(`${rankPrefix}${ign}`)
    .setURL(tame.playerUrl(ign))
    .setColor(rankSidebar(preview.rank?.key))
    .setThumbnail(avatarUrl(preview.uuid))
    .setDescription(stateLine)
    .addFields(
      // ✦ glyph is the website's network-level mark — the lone exception to
      // the "no emoji prefixes on field values" rule.
      statField("Network Level", `✦ ${level}`),
      statField("Rank", preview.rank?.label ?? "—"),
      statField("Games Tracked", `${playedGames.length} of ${preview.games.length}`),
    )
    .setFooter(themeFooter(ign));

  if (playedGames.length > 0) {
    embed.addFields(ruleField(), {
      name: "Modes Tracked",
      value: playedGames.map((g) => g.label).join(" · "),
      inline: false,
    });
  }

  return embed;
}
