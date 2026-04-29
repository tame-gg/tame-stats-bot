import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { tame, type PlayerPreview } from "../api/tame.ts";
import { getLinksForGuild } from "../db.ts";
import { formatNumber, mapLimit } from "../util.ts";
import type { BotCommand } from "./types.ts";

type GameId = "bedwars" | "skywars" | "duels" | "murder_mystery" | "build_battle";

const games: Array<{ name: string; value: GameId }> = [
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

const MEDAL_EMOJI = ["🥇", "🥈", "🥉"] as const;

function rankPrefix(index: number): string {
  return MEDAL_EMOJI[index] ?? `\`#${String(index + 1).padStart(2, "0")}\``;
}

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
    const links = getLinksForGuild(guildId);

    if (links.length < 2) {
      await interaction.editReply(
        "Need at least 2 linked players to rank. Run `/link <ign>` to join — your friends can too.",
      );
      return;
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
      await interaction.editReply(
        `No ${game.replaceAll("_", " ")} ${metric} data found for linked players.`,
      );
      return;
    }

    const description = ranked
      .map(
        (row, index) =>
          `${rankPrefix(index)} <@${row.link.discord_user_id}> (**${row.link.ign}**) · \`${formatNumber(row.value, row.digits)}\``,
      )
      .join("\n");

    const embed = new EmbedBuilder()
      .setTitle(`${game.replaceAll("_", " ")} · ${metric}`)
      .setColor(0xe8b84a)
      .setDescription(description)
      .setFooter({
        text: "Tracked Discord users only · /link <ign> to join",
        iconURL: tame.faviconUrl(),
      });

    await interaction.editReply({ embeds: [embed] });
  },
};
leaderboardCommand.json = leaderboardCommand.data.toJSON();
