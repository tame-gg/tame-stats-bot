import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { tame } from "../api/tame.ts";
import { THEME, codeBlock, themeAuthor, themeFooter } from "../embeds/theme.ts";
import type { BotCommand } from "./types.ts";

export const announcementCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("announcement")
    .setDescription("Show the tame.gg site announcement banner and recent activity ticker."),
  json: {} as never,
  async execute(interaction) {
    await interaction.deferReply();

    const [announcement, ticker] = await Promise.all([
      tame.announcement().catch(() => null),
      tame.ticker().catch(() => null),
    ]);

    const bannerText = announcement?.text?.trim() ?? "";
    const tickerLines = (ticker?.items ?? [])
      .map((item) => item.text.trim())
      .filter((text) => text.length > 0)
      .slice(0, 8);

    if (!bannerText && tickerLines.length === 0) {
      await interaction.editReply("No site announcement or ticker activity right now.");
      return;
    }

    const embed = new EmbedBuilder()
      .setAuthor(themeAuthor("site"))
      .setTitle("tame.gg")
      .setURL(tame.siteUrl("/"))
      .setColor(THEME.sidebar)
      .setFooter(themeFooter(null));

    const parts: string[] = [];
    if (bannerText) parts.push(`**Announcement**\n${bannerText}`);
    if (tickerLines.length > 0) {
      parts.push(`**Recent activity**\n${codeBlock(tickerLines)}`);
    }
    embed.setDescription(parts.join("\n\n"));

    await interaction.editReply({ embeds: [embed] });
  },
};
announcementCommand.json = announcementCommand.data.toJSON();
