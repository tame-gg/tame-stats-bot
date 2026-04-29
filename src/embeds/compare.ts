import { EmbedBuilder } from "discord.js";
import type { PlayerPreview } from "../api/tame.ts";
import { tame } from "../api/tame.ts";
import { formatNumber } from "../util.ts";

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

function fkdrLine(previews: readonly (PlayerPreview | null)[]): string | null {
  const parts: string[] = [];
  for (const p of previews) {
    if (!p) continue;
    const fkdr = p.games.find((g) => g.id === "bedwars")?.metrics.find((m) => m.key === "fkdr");
    parts.push(`${p.ign}: ${fkdr?.value != null ? formatNumber(fkdr.value, fkdr.digits) : "—"}`);
  }
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

export function buildCompareEmbed(
  igns: readonly string[],
  previews: readonly (PlayerPreview | null)[] = [],
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(compareTitle(igns))
    .setURL(tame.compareUrl(igns))
    .setColor(0x8b6f47)
    .setImage(tame.ogCompare(igns));

  // Tiny text row of Bedwars FKDR — redundant with the image but useful for
  // screen readers and people on really old Discord clients that don't render
  // the preview blob inline.
  const line = fkdrLine(previews);
  if (line) embed.addFields({ name: "Bedwars FKDR", value: line });

  return embed;
}
