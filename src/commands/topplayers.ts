import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { tame } from "../api/tame.ts";
import { THEME, codeBlock, padLeft, padRight, themeAuthor, themeFooter } from "../embeds/theme.ts";
import { formatNumber } from "../util.ts";
import type { BotCommand } from "./types.ts";

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

    // Fixed-width columns so the codeblock's monospace render aligns:
    //   `<rank>.  <ign>     ★ <star>   FKDR <fkdr>`
    // Rank is right-padded to the widest index (`10.` → 3 chars). IGN width
    // tracks the longest seen, capped to Mojang's 16-char max.
    const widestRank = String(rows.length).length + 1; // "10." → 3
    const ignWidth = Math.min(16, Math.max(...rows.map((r) => r.ign.length)));
    const starWidth = Math.max(...rows.map((r) => formatNumber(r.star, 0).length));

    const lines = rows.map((row, index) => {
      const rank = padLeft(`${index + 1}.`, widestRank);
      const ign = padRight(row.ign, ignWidth);
      const star = padLeft(formatNumber(row.star, 0), starWidth);
      const fkdr = row.fkdr !== null ? formatNumber(row.fkdr, 2) : "—";
      return `${rank}  ${ign}   ★ ${star}   FKDR ${fkdr}`;
    });

    const embed = new EmbedBuilder()
      .setAuthor(themeAuthor("leaderboard · bedwars"))
      .setTitle("Top players · Bedwars ★")
      .setURL(tame.siteUrl("/leaderboard"))
      .setColor(THEME.sidebar)
      .setDescription("*Tracked roster, ranked by star.*")
      .addFields({ name: "​", value: codeBlock(lines), inline: false })
      .setFooter(themeFooter("leaderboard"));

    await interaction.editReply({ embeds: [embed] });
  },
};
topPlayersCommand.json = topPlayersCommand.data.toJSON();
