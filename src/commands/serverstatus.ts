import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { tame } from "../api/tame.ts";
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

    const embed = new EmbedBuilder()
      .setTitle("Hypixel network status")
      .setURL("https://hypixel.net/")
      .setColor(status.online ? 0x55ff55 : 0xff5555)
      .addFields(
        { name: "Status", value: status.online ? "🟢 online" : "🔴 offline", inline: true },
        { name: "Players", value: playerLine, inline: true },
        { name: "Version", value: status.version ?? "—", inline: true },
      )
      .setFooter({ text: "stats.tame.gg · live status", iconURL: tame.faviconUrl() });

    await interaction.editReply({ embeds: [embed] });
  },
};
serverStatusCommand.json = serverStatusCommand.data.toJSON();
