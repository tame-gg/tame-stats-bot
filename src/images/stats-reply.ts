import {
  type ActionRowBuilder,
  AttachmentBuilder,
  type ButtonBuilder,
  EmbedBuilder,
} from "discord.js";
import type { BedwarsMode, HypixelSession, PlayerPreview } from "../api/tame.ts";
import { tame } from "../api/tame.ts";
import { appendFlairLines } from "../embeds/flair.ts";
import { rankSidebar, themeAuthor, themeFooter } from "../embeds/theme.ts";
import { compactSession } from "../util.ts";
import { renderBedwarsCard } from "./bedwars-card.ts";
import { fetchImageBuffer } from "./fetch.ts";

type ImageReplyParts = {
  files: AttachmentBuilder[];
  embeds: EmbedBuilder[];
  components?: ActionRowBuilder<ButtonBuilder>[];
};

function safeFilename(ign: string, suffix: string): string {
  const base = ign.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32);
  return `${base}-${suffix}.png`;
}

/**
 * Compact embed shell — online state + flair only. The stats image is the
 * primary payload; this embed carries context Discord can't bake into PNG.
 */
function buildContextEmbed(
  preview: PlayerPreview,
  section: string,
  session: HypixelSession | null,
  footerSlug: string,
): EmbedBuilder {
  const stateLine = session?.online
    ? `*Online — ${compactSession(session)}.*`
    : `*Last seen offline.*`;

  return new EmbedBuilder()
    .setAuthor(themeAuthor(section))
    .setURL(tame.playerUrl(preview.ign))
    .setColor(rankSidebar(preview.rank?.key))
    .setDescription(appendFlairLines(stateLine, preview))
    .setFooter(themeFooter(footerSlug));
}

/**
 * `/stats` — tame.gg player OG card as a file attachment + compact context
 * embed (flair, online state). Falls back to embed-only when the OG fetch
 * fails.
 */
export async function buildPlayerStatsReply(
  preview: PlayerPreview,
  session: HypixelSession | null,
): Promise<ImageReplyParts> {
  const buffer = await fetchImageBuffer(tame.ogPlayer(preview.ign));
  if (!buffer) {
    const { buildPlayerEmbed } = await import("../embeds/player.ts");
    return { files: [], embeds: [buildPlayerEmbed(preview, session)] };
  }

  return {
    files: [new AttachmentBuilder(buffer, { name: safeFilename(preview.ign, "stats") })],
    embeds: [buildContextEmbed(preview, "bedwars", session, preview.ign)],
  };
}

/**
 * Per-game stats (non-bedwars) — tame.gg game OG card as attachment.
 */
export async function buildGameStatsReply(
  preview: PlayerPreview,
  gameId: string,
  gameLabel: string,
  session: HypixelSession | null,
): Promise<ImageReplyParts> {
  const buffer = await fetchImageBuffer(tame.ogGame(preview.ign, gameId));
  if (!buffer) {
    const { buildGameEmbed } = await import("../embeds/game.ts");
    return {
      files: [],
      embeds: [buildGameEmbed(preview, gameId, gameLabel, session)],
    };
  }

  return {
    files: [new AttachmentBuilder(buffer, { name: safeFilename(preview.ign, gameId) })],
    embeds: [
      buildContextEmbed(
        preview,
        `${gameLabel.toLowerCase()} · overall`,
        session,
        `${preview.ign}/${gameId}`,
      ),
    ],
  };
}

/**
 * `/bedwars` — locally rendered mode-aware card. tame.gg's OG route has no
 * mode parameter, so we generate these in-bot and keep the button selector.
 */
export async function buildBedwarsStatsReply(
  preview: PlayerPreview,
  session: HypixelSession | null,
  mode: BedwarsMode,
  components: ActionRowBuilder<ButtonBuilder>[],
): Promise<ImageReplyParts> {
  const buffer = await renderBedwarsCard(preview, mode);

  return {
    files: [
      new AttachmentBuilder(buffer, {
        name: safeFilename(preview.ign, `bedwars-${mode}`),
      }),
    ],
    embeds: [
      buildContextEmbed(preview, `bedwars · ${mode}`, session, `${preview.ign}/bedwars`),
    ],
    components,
  };
}

/**
 * `/hypixel` — network overview uses the player OG card (headline Bedwars
 * tiles + net level) with a hypixel-labelled context embed.
 */
export async function buildHypixelStatsReply(
  preview: PlayerPreview,
  session: HypixelSession | null,
): Promise<ImageReplyParts> {
  const buffer = await fetchImageBuffer(tame.ogPlayer(preview.ign));
  if (!buffer) {
    const { buildHypixelOverviewEmbed } = await import("../embeds/game.ts");
    return { files: [], embeds: [buildHypixelOverviewEmbed(preview, session)] };
  }

  const level =
    preview.networkLevel !== null
      ? Math.floor(preview.networkLevel).toLocaleString("en-US")
      : "?";
  const playedGames = preview.games.filter((g) => g.hasPlayed);

  const embed = buildContextEmbed(preview, "hypixel", session, preview.ign);
  const extra = [`Network level **✦ ${level}**`, `Games tracked **${playedGames.length}**`];
  if (playedGames.length > 0) {
    extra.push(playedGames.map((g) => g.label).join(" · "));
  }
  const base = embed.data.description ?? "";
  embed.setDescription([base, ...extra.map((line) => `*${line}*`)].filter(Boolean).join("\n"));

  return {
    files: [new AttachmentBuilder(buffer, { name: safeFilename(preview.ign, "hypixel") })],
    embeds: [embed],
  };
}
