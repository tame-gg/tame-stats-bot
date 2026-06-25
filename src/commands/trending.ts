import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { tame } from "../api/tame.ts";
import { THEME, codeBlock, padLeft, padRight, themeAuthor, themeFooter } from "../embeds/theme.ts";
import { formatNumber } from "../util.ts";
import type { BotCommand } from "./types.ts";

export const trendingCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("trending")
    .setDescription("Show the biggest movers on tame.gg over the last few days.")
    .addIntegerOption((option) =>
      option.setName("limit").setDescription("How many players (1–10, default 6)").setMinValue(1).setMaxValue(10),
    ),
  json: {} as never,
  async execute(interaction) {
    await interaction.deferReply();
    const limit = interaction.options.getInteger("limit") ?? 6;
    const rows = await tame.trending(limit);

    if (rows.length === 0) {
      await interaction.editReply("No trending activity right now — check back after more digests land.");
      return;
    }

    const rankWidth = String(rows.length).length + 1;
    const ignWidth = Math.min(16, Math.max(...rows.map((r) => r.ign.length)));

    const lines = rows.map((row, index) => {
      const rank = padLeft(`${index + 1}.`, rankWidth);
      const ign = padRight(row.ign, ignWidth);
      const fkdr = row.fkdrChange >= 0 ? `+${formatNumber(row.fkdrChange, 2)}` : formatNumber(row.fkdrChange, 2);
      const star =
        row.starChange >= 0 ? `+${formatNumber(row.starChange, 0)}` : formatNumber(row.starChange, 0);
      return `${rank}  ${ign}   ΔFKDR ${fkdr}   Δ★ ${star}   ${row.games}g`;
    });

    const embed = new EmbedBuilder()
      .setAuthor(themeAuthor("trending"))
      .setTitle("Trending players")
      .setURL(tame.siteUrl("/"))
      .setColor(THEME.sidebar)
      .setDescription("*Biggest FKDR swings and grinders over the last 3 days.*")
      .addFields({ name: "​", value: codeBlock(lines), inline: false })
      .setFooter(themeFooter(null));

    await interaction.editReply({ embeds: [embed] });
  },
};
trendingCommand.json = trendingCommand.data.toJSON();
