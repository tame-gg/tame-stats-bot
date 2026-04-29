import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { tame } from "../api/tame.ts";
import { formatNumber } from "../util.ts";
import type { BotCommand } from "./types.ts";

const MEDAL_EMOJI = ["🥇", "🥈", "🥉"] as const;

function rankPrefix(index: number): string {
  return MEDAL_EMOJI[index] ?? `\`#${String(index + 1).padStart(2, "0")}\``;
}

export const topPlayersCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("topplayers")
    .setDescription("Show the global Bedwars star leaderboard (top tracked players).")
    .addIntegerOption((option) =>
      option.setName("limit").setDescription("How many players (1–25, default 10)").setMinValue(1).setMaxValue(25),
    ),
  json: {} as never,
  async execute(interaction) {
    await interaction.deferReply();
    const limit = interaction.options.getInteger("limit") ?? 10;
    const rows = await tame.leaderboard(limit);

    if (rows.length === 0) {
      await interaction.editReply("No tracked players have Bedwars stats yet.");
      return;
    }

    const description = rows
      .map((row, index) => {
        const fkdr = row.fkdr !== null ? formatNumber(row.fkdr, 2) : "—";
        return `${rankPrefix(index)} **${row.ign}** · \`★ ${formatNumber(row.star, 0)}\` · FKDR ${fkdr} · wins ${formatNumber(row.wins, 0)}`;
      })
      .join("\n");

    const embed = new EmbedBuilder()
      .setTitle("Bedwars · global star leaderboard")
      .setURL(tame.siteUrl("/leaderboard"))
      .setColor(0xe8b84a)
      .setDescription(description)
      .setFooter({ text: "stats.tame.gg · tracked roster", iconURL: tame.faviconUrl() });

    await interaction.editReply({ embeds: [embed] });
  },
};
topPlayersCommand.json = topPlayersCommand.data.toJSON();
