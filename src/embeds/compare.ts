import { EmbedBuilder } from "discord.js";
import type { PlayerPreview } from "../api/tame.ts";
import { tame } from "../api/tame.ts";
import { formatNumber } from "../util.ts";
import { THEME, codeBlock, padLeft, padRight, themeAuthor, themeFooter } from "./theme.ts";

/**
 * Format the title to match the OG compare image's grammar: two players
 * read as `A vs B`; three or more read as `A, B vs C` (everyone but the
 * last comma-joined, then `vs <last>`). The OG generator does the same.
 */
function compareTitle(igns: readonly string[]): string {
  if (igns.length === 2) return `${igns[0]} vs ${igns[1]}`;
  if (igns.length < 2) return igns[0] ?? "";
  const head = igns.slice(0, -1).join(", ");
  return `${head} vs ${igns[igns.length - 1]}`;
}

type Row = { ign: string; star: string; fkdr: string; wlr: string };

function pickRow(ign: string, preview: PlayerPreview | null): Row {
  const game = preview?.games.find((g) => g.id === "bedwars");
  const fkdr = game?.metrics.find((m) => m.key === "fkdr");
  const wlr = game?.metrics.find((m) => m.key === "wlr");
  const star = game?.metrics.find((m) => m.key === "star");
  return {
    ign,
    star: star?.value != null ? formatNumber(star.value, 0) : "—",
    fkdr: fkdr?.value != null ? formatNumber(fkdr.value, fkdr.digits) : "—",
    wlr: wlr?.value != null ? formatNumber(wlr.value, wlr.digits) : "—",
  };
}

/**
 * `/compare` — head-to-head embed. Body is the OG compare card image; the
 * embed text is a minimal fixed-width codeblock list keyed by FKDR (the
 * implicit "winner" mark `■` on row #1, hollow `□` on the rest). Sidebar
 * is always ink — compare embeds are never single-player-focused so the
 * gold accent isn't appropriate here.
 */
export function buildCompareEmbed(
  igns: readonly string[],
  previews: readonly (PlayerPreview | null)[] = [],
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setAuthor(themeAuthor("compare"))
    .setTitle(compareTitle(igns))
    .setURL(tame.compareUrl(igns))
    .setColor(THEME.sidebar)
    .setDescription("*Bedwars · head-to-head.*")
    .setImage(tame.ogCompare(igns))
    .setFooter(themeFooter("compare"));

  const rows: Row[] = igns.map((ign, i) => pickRow(ign, previews[i] ?? null));

  // Sort by FKDR descending so the visual leader is at the top — same
  // ordering the OG compare card uses for consistency. Non-numeric FKDRs
  // (the "—" sentinel) sort last via Infinity-coercion trick.
  const ranked = [...rows].sort((a, b) => {
    const aN = parseFloat(a.fkdr);
    const bN = parseFloat(b.fkdr);
    return (Number.isFinite(bN) ? bN : -Infinity) - (Number.isFinite(aN) ? aN : -Infinity);
  });

  // Pad columns so the codeblock's monospace render keeps things aligned.
  // Widths chosen to fit the longest IGN we expect (16 char Mojang max).
  const ignWidth = Math.min(16, Math.max(...ranked.map((r) => r.ign.length)));
  const lines = ranked.map((r, i) => {
    const marker = i === 0 ? "■" : "□";
    const ign = padRight(r.ign, ignWidth);
    const fkdr = padLeft(r.fkdr, 5);
    const wlr = padLeft(r.wlr, 5);
    const star = padLeft(r.star, 4);
    return `${marker}  ${ign}  FKDR ${fkdr}   WLR ${wlr}   ★ ${star}`;
  });

  embed.addFields({ name: "​", value: codeBlock(lines), inline: false });

  return embed;
}
