import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { tame, type RankIndexGroup } from "../api/tame.ts";
import { THEME, codeBlock, padRight, themeAuthor, themeFooter } from "../embeds/theme.ts";
import type { BotCommand } from "./types.ts";

function formatGroupLines(groups: RankIndexGroup[]): string[] {
  const countWidth = Math.max(...groups.map((g) => String(g.count).length));
  const labelWidth = Math.min(10, Math.max(...groups.map((g) => g.rank.label.length)));
  return groups.map((group) => {
    const label = padRight(group.rank.label, labelWidth);
    const count = String(group.count).padStart(countWidth);
    const sample = group.players
      .slice(0, 3)
      .map((p) => p.ign)
      .join(", ");
    const suffix = group.count > group.players.length ? " …" : "";
    return `${label}  ${count}×   ${sample}${suffix}`;
  });
}

export const ranksCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("ranks")
    .setDescription("Hypixel rank breakdown across the tame.gg tracked roster.")
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

    // Prefer the server-side index if tame.gg ever ships /api/bot/ranks; it's
    // the full DB aggregation. Until then this returns null and we derive a
    // live breakdown from the public tracked roster instead.
    const index = await tame.ranks(limit);
    if (index && index.groups.length > 0) {
      const groups = index.groups.slice(0, limit);
      const embed = new EmbedBuilder()
        .setAuthor(themeAuthor("ranks"))
        .setTitle("Hypixel Rank Index")
        .setURL(tame.siteUrl("/ranks"))
        .setColor(THEME.sidebar)
        .setDescription(
          `*${index.totalRanks} unique rank${index.totalRanks === 1 ? "" : "s"} across ${index.totalPlayers.toLocaleString("en-US")} tracked players.*`,
        )
        .addFields({ name: "​", value: codeBlock(formatGroupLines(groups)), inline: false })
        .setFooter(themeFooter("ranks"));
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Fallback: aggregate ranks from a live sample of the tracked roster.
    const derived = await tame.rankIndexFromRoster();
    if (derived.counted === 0) {
      const embed = new EmbedBuilder()
        .setAuthor(themeAuthor("ranks"))
        .setTitle("Hypixel Rank Index")
        .setURL(tame.siteUrl("/ranks"))
        .setColor(THEME.sidebar)
        .setDescription(
          [
            "Couldn't sample any snapshotted players right now.",
            "",
            `Open **[tame.gg/stats/ranks](${tame.siteUrl("/ranks")})** for the complete, searchable index.`,
          ].join("\n"),
        )
        .setFooter(themeFooter("ranks"));
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const groups = derived.groups.slice(0, limit);
    const embed = new EmbedBuilder()
      .setAuthor(themeAuthor("ranks"))
      .setTitle("Hypixel Rank Breakdown")
      .setURL(tame.siteUrl("/ranks"))
      .setColor(THEME.sidebar)
      .setDescription(
        [
          `*Live sample of **${derived.counted.toLocaleString("en-US")}** snapshotted players from the **${derived.rosterTotal.toLocaleString("en-US")}**-player roster — ${derived.totalRanks} distinct rank${derived.totalRanks === 1 ? "" : "s"}.*`,
          `*Full searchable index → [tame.gg/stats/ranks](${tame.siteUrl("/ranks")}).*`,
        ].join("\n"),
      )
      .addFields({ name: "​", value: codeBlock(formatGroupLines(groups)), inline: false })
      .setFooter(themeFooter("ranks"));

    await interaction.editReply({ embeds: [embed] });
  },
};
ranksCommand.json = ranksCommand.data.toJSON();
