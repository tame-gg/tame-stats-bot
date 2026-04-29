import { EmbedBuilder } from "discord.js";
import type { BedwarsMode, HypixelSession, PlayerPreview, PreviewMetric } from "../api/tame.ts";
import { tame } from "../api/tame.ts";
import { compactSession, formatNumber } from "../util.ts";
import {
  THEME,
  headUrl,
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
 * Fixed-order secondary grid for `/bedwars`. The design canvas is explicit
 * — these 12 cells render in this order regardless of API order, and any
 * missing metric falls through to `—` rather than being skipped, so the
 * grid layout stays uniform across modes (Solo with no games has the same
 * 12 slots as Overall).
 */
const BEDWARS_SECONDARY_KEYS: readonly string[] = [
  "wins",
  "losses",
  "finalKills",
  "finalDeaths",
  "kills",
  "deaths",
  "bedsBroken",
  "bedsLost",
  "kdr",
  "bblr",
  "star",
  "winstreak",
] as const;

/**
 * Display label shown to users for each `BedwarsMode`. Keep these short
 * so the author eyebrow (`bedwars · doubles`) and button labels stay
 * legible at small sizes.
 */
const BEDWARS_MODE_LABELS: Record<BedwarsMode, string> = {
  overall: "Overall",
  solo: "Solo",
  doubles: "Doubles",
  trios: "Trios",
  fours: "Fours",
  dreams: "Dreams",
};

function findMetric(metrics: readonly PreviewMetric[], key: string): PreviewMetric | undefined {
  return metrics.find((m) => m.key === key);
}

function fmtMetric(metric: PreviewMetric | undefined): string {
  if (!metric || metric.value === null) return "—";
  return formatNumber(metric.value, metric.digits);
}

/**
 * Pick the metric array for a given Bedwars mode. `overall` returns the
 * top-level `metrics`; everything else reads from `game.modes[mode]`. A
 * missing mode entry (older preview blob predating the modes field) is
 * treated as "not played" — bot UI shows the empty-state copy.
 */
function pickBedwarsMetrics(
  game: NonNullable<ReturnType<typeof findGame>>,
  mode: BedwarsMode,
): { metrics: readonly PreviewMetric[]; hasMode: boolean } {
  if (mode === "overall") return { metrics: game.metrics, hasMode: true };
  const modeMetrics = game.modes?.[mode];
  if (!modeMetrics || modeMetrics.length === 0) {
    return { metrics: [], hasMode: false };
  }
  return { metrics: modeMetrics, hasMode: true };
}

function findGame(preview: PlayerPreview, gameId: string) {
  return preview.games.find((g) => g.id === gameId);
}

/**
 * Build the editorial-style description line for a Bedwars embed:
 * `★ N · X deaths · Y losses · Z beds lost.`. Pieces appear in fixed
 * order; any piece whose metric is missing is dropped. Returns null when
 * every piece is missing — caller substitutes the empty-state copy.
 */
function buildBedwarsDescription(metrics: readonly PreviewMetric[]): string | null {
  const star = findMetric(metrics, "star");
  const deaths = findMetric(metrics, "deaths");
  const losses = findMetric(metrics, "losses");
  const bedsLost = findMetric(metrics, "bedsLost");

  const pieces: string[] = [];
  if (star && star.value !== null) pieces.push(`★ ${formatNumber(star.value, 0)}`);
  if (deaths && deaths.value !== null) pieces.push(`${formatNumber(deaths.value, 0)} deaths`);
  if (losses && losses.value !== null) pieces.push(`${formatNumber(losses.value, 0)} losses`);
  if (bedsLost && bedsLost.value !== null) {
    pieces.push(`${formatNumber(bedsLost.value, 0)} beds lost`);
  }
  if (pieces.length === 0) return null;
  return pieces.join(" · ") + ".";
}

/**
 * `/bedwars` — fixed-shape embed with a `mode` selector. Distinct from
 * the other per-game embeds: ordered 12-cell secondary grid, editorial
 * description, plain (non-hyperlinked) title, mc-heads `/head/96` thumb.
 *
 * `mode` defaults to `"overall"`. Each non-overall mode is read from
 * `game.modes[mode]`; if the player has zero games in that mode the
 * embed renders the same shell with `—` everywhere and a `*No <Mode>
 * games tracked.*` description so the layout doesn't shift between modes.
 */
function buildBedwarsEmbed(
  preview: PlayerPreview,
  session: HypixelSession | null,
  mode: BedwarsMode,
): EmbedBuilder {
  const ign = preview.ign;
  const rankPrefix = preview.rank?.label ? `[${preview.rank.label}] ` : "";
  const game = findGame(preview, "bedwars");
  const modeLabel = BEDWARS_MODE_LABELS[mode];

  // Title is plain text (no setURL). The previous setURL turned the IGN
  // into a blue hyperlink that fought the white-on-ink design — Discord
  // gives us no way to suppress link styling on a title with setURL.
  const embed = new EmbedBuilder()
    .setAuthor(themeAuthor(`bedwars · ${mode}`))
    .setTitle(`${rankPrefix}${ign}`)
    .setColor(THEME.sidebar)
    .setFooter(themeFooter(`${ign}/bedwars`));

  // mc-heads /head/96 — verified to return a real 96×102 PNG for both
  // dashed and undashed UUIDs. The previous /avatar/64 endpoint was
  // returning a black-square placeholder.
  embed.setThumbnail(headUrl(preview.uuid));

  // Online state takes priority over the editorial line — the player's
  // current activity is more interesting than their stat summary when
  // it's available.
  const onlineLine = session?.online ? `*Online — ${compactSession(session)}.*` : null;

  if (!game || !game.hasPlayed) {
    embed.setDescription(
      onlineLine ?? `*No Bedwars stats — either they haven't played, or their Hypixel API setting is off.*`,
    );
    return embed;
  }

  const { metrics, hasMode } = pickBedwarsMetrics(game, mode);

  if (!hasMode) {
    // Mode-empty case: the design wants the layout uniform — same FKDR/WLR
    // headline, same 12-cell grid, all `—`, with a special description
    // explaining the empty state.
    const description = onlineLine
      ? `${onlineLine}\n*No ${modeLabel} games tracked.*`
      : `*No ${modeLabel} games tracked.*`;
    embed.setDescription(description);
    embed.addFields(statField("FKDR", "—"), statField("WLR", "—"), ruleField());
    embed.addFields(
      BEDWARS_SECONDARY_KEYS.map((key) => statField(formatBedwarsLabel(key), "—")),
    );
    return embed;
  }

  // Editorial description — the design's `★ N · X deaths · Y losses · Z
  // beds lost.` line. Stacks under the online line when both apply.
  const editorial = buildBedwarsDescription(metrics);
  const descLines = [onlineLine, editorial ? `*${editorial}*` : null].filter(
    (line): line is string => line !== null,
  );
  if (descLines.length > 0) embed.setDescription(descLines.join("\n"));

  // Headline 2-up: FKDR, WLR.
  embed.addFields(
    statField("FKDR", fmtMetric(findMetric(metrics, "fkdr"))),
    statField("WLR", fmtMetric(findMetric(metrics, "wlr"))),
    ruleField(),
  );

  // Secondary 12-cell grid in fixed order. `star` gets a ★ prefix.
  embed.addFields(
    BEDWARS_SECONDARY_KEYS.map((key) => {
      const metric = findMetric(metrics, key);
      const raw = fmtMetric(metric);
      const value = key === "star" && raw !== "—" ? `★ ${raw}` : raw;
      return statField(formatBedwarsLabel(key), value);
    }),
  );

  return embed;
}

/**
 * Human-readable label for a Bedwars metric key. Mirrors the website's
 * `headlineMetrics`/`chartMetrics` labels but inlined here so the bedwars
 * embed survives an empty `metrics: []` array (where there's no metric
 * object to read `.label` from).
 */
function formatBedwarsLabel(key: string): string {
  switch (key) {
    case "wins":
      return "Wins";
    case "losses":
      return "Losses";
    case "finalKills":
      return "Final Kills";
    case "finalDeaths":
      return "Final Deaths";
    case "kills":
      return "Kills";
    case "deaths":
      return "Deaths";
    case "bedsBroken":
      return "Beds Broken";
    case "bedsLost":
      return "Beds Lost";
    case "kdr":
      return "KDR";
    case "bblr":
      return "BBLR";
    case "star":
      return "Star";
    case "winstreak":
      return "Winstreak";
    default:
      return key;
  }
}

/**
 * Per-game stats embed (`/skywars`, `/duels`, `/murdermystery`,
 * `/buildbattle`, plus the `mode === "overall"` path of `/bedwars`).
 * Different visual rhythm from `/stats`: a small mc-heads thumbnail
 * instead of the full OG card, then a 2-up headline + n-up secondary
 * metric grid as inline fields.
 *
 * Sidebar defaults to ink; per-game embeds aren't player-focused (they're
 * stat-focused), so the gold accent is reserved for `/stats`.
 *
 * The `mode` parameter is bedwars-only; everything else ignores it.
 */
export function buildGameEmbed(
  preview: PlayerPreview,
  gameId: string,
  gameLabel: string,
  session: HypixelSession | null,
  mode: BedwarsMode = "overall",
): EmbedBuilder {
  if (gameId === "bedwars") {
    return buildBedwarsEmbed(preview, session, mode);
  }

  const ign = preview.ign;
  const game = findGame(preview, gameId);
  const rankPrefix = preview.rank?.label ? `${preview.rank.label} ` : "";

  const embed = new EmbedBuilder()
    .setAuthor(themeAuthor(`${gameLabel.toLowerCase()} · overall`))
    .setTitle(`${rankPrefix}${ign}`)
    .setURL(tame.playerUrl(ign))
    .setColor(THEME.sidebar)
    .setThumbnail(headUrl(preview.uuid))
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
    .setThumbnail(headUrl(preview.uuid))
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

export { BEDWARS_MODE_LABELS };
