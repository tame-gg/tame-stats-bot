import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { tame } from "../api/tame.ts";
import { adminBadgeGlyphs } from "../embeds/flair.ts";
import { THEME, codeBlock, padLeft, padRight, themeAuthor, themeFooter } from "../embeds/theme.ts";
import type { BotCommand } from "./types.ts";

export const trackedCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("tracked")
    .setDescription("Browse the tame.gg tracked player roster.")
    .addIntegerOption((option) =>
      option.setName("limit").setDescription("How many players (1–16, default 10)").setMinValue(1).setMaxValue(16),
    )
    .addIntegerOption((option) =>
      option.setName("page").setDescription("Page number (1-based, default 1)").setMinValue(1).setMaxValue(100),
    ),
  json: {} as never,
  async execute(interaction) {
    await interaction.deferReply();
    const limit = interaction.options.getInteger("limit") ?? 10;
    const page = interaction.options.getInteger("page") ?? 1;
    const offset = (page - 1) * limit;

    const roster = await tame.trackedRoster(limit, offset);
    if (roster.players.length === 0) {
      await interaction.editReply(
        page > 1 ? `No players on page ${page}.` : "No tracked players yet.",
      );
      return;
    }

    const displayIgns = roster.players.map(
      (p) => `${adminBadgeGlyphs(p.adminBadges ?? [])}${p.ign}`,
    );
    const rankWidth = String(roster.players.length).length + 1;
    const ignWidth = Math.min(20, Math.max(...displayIgns.map((ign) => ign.length)));

    const lines = roster.players.map((player, index) => {
      const rank = padLeft(`${offset + index + 1}.`, rankWidth);
      const ign = padRight(displayIgns[index] as string, ignWidth);
      const rankLabel = player.rank.label === "None" ? "—" : player.rank.label;
      const modes = player.modes > 0 ? `${player.modes} modes` : "no snaps";
      return `${rank}  ${ign}   ${rankLabel}   ${modes}`;
    });

    const embed = new EmbedBuilder()
      .setAuthor(themeAuthor("tracked"))
      .setTitle("Tracked players")
      .setURL(tame.siteUrl("/tracked"))
      .setColor(THEME.sidebar)
      .setDescription(
        `*${roster.total.toLocaleString("en-US")} players on the roster · page ${page}.*`,
      )
      .addFields({ name: "​", value: codeBlock(lines), inline: false })
      .setFooter(themeFooter("tracked"));

    await interaction.editReply({ embeds: [embed] });
  },
};
trackedCommand.json = trackedCommand.data.toJSON();
