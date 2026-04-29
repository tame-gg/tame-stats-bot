import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { tame } from "../api/tame.ts";
import { THEME, statField, themeAuthor, themeFooter } from "../embeds/theme.ts";
import { formatNumber } from "../util.ts";
import type { BotCommand } from "./types.ts";

export const serverStatusCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("serverstatus")
    .setDescription("Show Hypixel network status (player count, version)."),
  json: {} as never,
  async execute(interaction) {
    await interaction.deferReply();
    const status = await tame.hypixelStatus();

    if (!status) {
      await interaction.editReply("stats.tame.gg's status feed is unavailable right now.");
      return;
    }

    const playerLine =
      status.players !== null && status.max !== null
        ? `${formatNumber(status.players, 0)} / ${formatNumber(status.max, 0)}`
        : status.players !== null
          ? formatNumber(status.players, 0)
          : "—";

    // Single headline — current player count — and a one-line italic state
    // blurb. Sidebar stays ink even when offline; we don't paint the whole
    // embed red because that's louder than the actual signal.
    const stateLine = status.online ? "*Hypixel is online.*" : "*Hypixel is offline.*";

    const embed = new EmbedBuilder()
      .setAuthor(themeAuthor("network status"))
      .setTitle("Hypixel network")
      .setURL("https://hypixel.net/")
      .setColor(THEME.sidebar)
      .setDescription(stateLine)
      .addFields(
        statField("Players", playerLine),
        statField("Version", status.version ?? "—"),
        statField("State", status.online ? "Online" : "Offline"),
      )
      .setFooter(themeFooter(null));

    await interaction.editReply({ embeds: [embed] });
  },
};
serverStatusCommand.json = serverStatusCommand.data.toJSON();
