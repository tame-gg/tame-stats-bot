import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { tame, type RankIndexGroup } from "../api/tame.ts";
import { THEME, codeBlock, themeAuthor, themeFooter } from "../embeds/theme.ts";
import type { BotCommand } from "./types.ts";

function formatRankLabel(group: RankIndexGroup): string {
  if (group.rank.key === "NONE" || group.rank.segments.length === 0) {
    return group.rank.label;
  }
  return group.rank.label;
}

export const ranksCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("ranks")
    .setDescription("Hypixel rank index across the tame.gg tracked roster.")
    .addIntegerOption((option) =>
      option
        .setName("limit")
        .setDescription("How many rank groups to show (1–15, default 10)")
        .setMinValue(1)
        .setMaxValue(15),
    ),
  json: {} as never,
  async execute(interaction) {
    await interaction.deferReply();
    const limit = interaction.options.getInteger("limit") ?? 10;
    const index = await tame.ranks(limit);

    if (!index) {
      const embed = new EmbedBuilder()
        .setAuthor(themeAuthor("ranks"))
        .setTitle("Hypixel Rank Index")
        .setURL(tame.siteUrl("/ranks"))
        .setColor(THEME.sidebar)
        .setDescription(
          [
            "The full rank index lives on the website — every unique Hypixel rank observed across tracked players, grouped with player lists.",
            "",
            `Open **[tame.gg/stats/ranks](${tame.siteUrl("/ranks")})** for the complete, searchable index.`,
            "",
            "*A bot API for this page isn't deployed yet — the /ranks command will populate automatically once tame.gg ships /api/bot/ranks.*",
          ].join("\n"),
        )
        .setFooter(themeFooter("ranks"));
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const groups = index.groups.slice(0, limit);
    if (groups.length === 0) {
      await interaction.editReply("No rank data yet — track players on tame.gg to populate the index.");
      return;
    }

    const lines = groups.map((group) => {
      const sample = group.players
        .slice(0, 3)
        .map((p) => p.ign)
        .join(", ");
      const suffix = group.players.length > 3 ? ` +${group.players.length - 3} more` : "";
      return `${formatRankLabel(group)}  ·  ${group.count} player${group.count === 1 ? "" : "s"}  ·  ${sample}${suffix}`;
    });

    const embed = new EmbedBuilder()
      .setAuthor(themeAuthor("ranks"))
      .setTitle("Hypixel Rank Index")
      .setURL(tame.siteUrl("/ranks"))
      .setColor(THEME.sidebar)
      .setDescription(
        `*${index.totalRanks} unique rank${index.totalRanks === 1 ? "" : "s"} across ${index.totalPlayers.toLocaleString("en-US")} tracked players.*`,
      )
      .addFields({ name: "​", value: codeBlock(lines), inline: false })
      .setFooter(themeFooter("ranks"));

    await interaction.editReply({ embeds: [embed] });
  },
};
ranksCommand.json = ranksCommand.data.toJSON();
