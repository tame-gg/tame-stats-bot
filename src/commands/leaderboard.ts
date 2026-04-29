import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { tame, type PlayerPreview } from "../api/tame.ts";
import { getLinksForGuild } from "../db.ts";
import { THEME, codeBlock, padLeft, padRight, themeAuthor, themeFooter } from "../embeds/theme.ts";
import { formatNumber, mapLimit } from "../util.ts";
import type { BotCommand } from "./types.ts";

export type LeaderboardGameId = "bedwars" | "skywars" | "duels" | "murder_mystery" | "build_battle";

const games: Array<{ name: string; value: LeaderboardGameId }> = [
  { name: "Bedwars", value: "bedwars" },
  { name: "Skywars", value: "skywars" },
  { name: "Duels", value: "duels" },
  { name: "Murder Mystery", value: "murder_mystery" },
  { name: "Build Battle", value: "build_battle" },
];

const metricChoices = [
  { name: "FKDR", value: "fkdr" },
  { name: "WLR", value: "wlr" },
  { name: "Star", value: "star" },
  { name: "Wins", value: "wins" },
  { name: "Final Kills", value: "finalKills" },
  { name: "KDR", value: "kdr" },
  { name: "Kills", value: "kills" },
  { name: "Score", value: "score" },
];

function readMetric(
  preview: PlayerPreview,
  gameId: string,
  metricKey: string,
): { value: number; digits: number } | null {
  const game = preview.games.find((g) => g.id === gameId);
  const metric = game?.metrics.find((m) => m.key === metricKey);
  if (!metric || metric.value === null) return null;
  return { value: metric.value, digits: metric.digits };
}

export function leaderboardGameLabel(id: string): string {
  return games.find((g) => g.value === id)?.name ?? id.replaceAll("_", " ");
}

export function leaderboardMetricLabel(key: string): string {
  return metricChoices.find((m) => m.value === key)?.name ?? key;
}

/**
 * Build the game-selector button row shown under every `/leaderboard`
 * embed. Pressed game = Primary, the rest = Secondary. `customId` shape:
 * `lb:game:<game>:<metric>` — both fields persist across clicks so the
 * dispatcher can re-rank with the chosen metric.
 */
export function buildLeaderboardGameRow(
  pressed: string,
  metric: string,
): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const g of games) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`lb:game:${g.value}:${metric}`)
        .setLabel(g.name)
        .setStyle(g.value === pressed ? ButtonStyle.Primary : ButtonStyle.Secondary),
    );
  }
  return row;
}

export type LeaderboardRender =
  | { kind: "ok"; embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> }
  | { kind: "empty"; message: string };

/**
 * Build the leaderboard embed + game-selector row from scratch. Shared by
 * the slash-command path (`execute()`) and the button-dispatcher path so a
 * /leaderboard with `game=bedwars` and an "Skywars" button click produce
 * the same artifacts. Returns `{ kind: "empty", message }` on a degenerate
 * roster (under 2 linked players, or no metric data) so the caller can
 * decide between `editReply(message)` and the full-embed path.
 */
export async function renderLeaderboard(
  guildId: string,
  game: string,
  metric: string,
): Promise<LeaderboardRender> {
  const links = getLinksForGuild(guildId);
  if (links.length < 2) {
    return {
      kind: "empty",
      message:
        "Need at least 2 linked players to rank. Run `/link <ign>` to join — your friends can too.",
    };
  }

  const rows = await mapLimit(links, 5, async (link) => ({
    link,
    preview: await tame.preview(link.uuid).catch(() => null),
  }));

  const ranked = rows
    .map(({ link, preview }) => {
      if (!preview) return null;
      const picked = readMetric(preview, game, metric);
      if (!picked) return null;
      return { link, ...picked };
    })
    .filter((row): row is { link: (typeof links)[number]; value: number; digits: number } => !!row)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  if (ranked.length === 0) {
    return {
      kind: "empty",
      message: `No ${leaderboardGameLabel(game)} ${leaderboardMetricLabel(metric)} data found for linked players.`,
    };
  }

  // Fixed-width codeblock rows so the monospace render keeps the columns
  // tidy. We drop the `<@discord_user_id>` mention from the rank line
  // because Discord doesn't expand mentions inside codeblocks; the
  // canonical IGN is what reads as "this player" anyway.
  const rankWidth = String(ranked.length).length + 1; // "10." → 3
  const ignWidth = Math.min(16, Math.max(...ranked.map((r) => r.link.ign.length)));
  const valueStrs = ranked.map((r) => formatNumber(r.value, r.digits));
  const valueWidth = Math.max(...valueStrs.map((s) => s.length));

  const lines = ranked.map((row, index) => {
    const rank = padLeft(`${index + 1}.`, rankWidth);
    const ign = padRight(row.link.ign, ignWidth);
    const value = padLeft(valueStrs[index] as string, valueWidth);
    return `${rank}  ${ign}   ${leaderboardMetricLabel(metric)} ${value}`;
  });

  const embed = new EmbedBuilder()
    .setAuthor(themeAuthor(`leaderboard · ${leaderboardGameLabel(game).toLowerCase()}`))
    .setTitle(`${leaderboardGameLabel(game)} · ${leaderboardMetricLabel(metric)}`)
    .setColor(THEME.sidebar)
    .setDescription("*Linked Discord users in this server, ranked.*")
    .addFields({ name: "​", value: codeBlock(lines), inline: false })
    .setFooter(themeFooter(null));

  return { kind: "ok", embed, row: buildLeaderboardGameRow(game, metric) };
}

export const leaderboardCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Rank linked Discord users in this server.")
    .addStringOption((option) =>
      option.setName("game").setDescription("Game").setRequired(false).addChoices(...games),
    )
    .addStringOption((option) =>
      option.setName("metric").setDescription("Metric").setRequired(false).addChoices(...metricChoices),
    ),
  json: {} as never,
  async execute(interaction) {
    await interaction.deferReply();
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.editReply("Leaderboards are server-scoped. Run this in a guild.");
      return;
    }

    const game = interaction.options.getString("game") ?? "bedwars";
    const metric = interaction.options.getString("metric") ?? "fkdr";

    const result = await renderLeaderboard(guildId, game, metric);
    if (result.kind === "empty") {
      await interaction.editReply(result.message);
      return;
    }

    await interaction.editReply({ embeds: [result.embed], components: [result.row] });
  },
};
leaderboardCommand.json = leaderboardCommand.data.toJSON();
