import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { tame } from "../api/tame.ts";
import type { BotCommand } from "./types.ts";

function relativeAge(addedAtSec: number): string {
  const ageSec = Math.max(0, Math.floor(Date.now() / 1000) - addedAtSec);
  if (ageSec < 60) return "just now";
  if (ageSec < 3600) return `${Math.floor(ageSec / 60)}m ago`;
  if (ageSec < 86400) return `${Math.floor(ageSec / 3600)}h ago`;
  return `${Math.floor(ageSec / 86400)}d ago`;
}

export const recentCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("recent")
    .setDescription("Show the most recently tracked players on stats.tame.gg.")
    .addIntegerOption((option) =>
      option.setName("limit").setDescription("How many players (1–25, default 10)").setMinValue(1).setMaxValue(25),
    ),
  json: {} as never,
  async execute(interaction) {
    await interaction.deferReply();
    const limit = interaction.options.getInteger("limit") ?? 10;
    const rows = await tame.recent(limit);

    if (rows.length === 0) {
      await interaction.editReply("No tracked players yet.");
      return;
    }

    const description = rows
      .map((row) => `· **${row.ign}** — added ${relativeAge(row.addedAt)}`)
      .join("\n");

    const embed = new EmbedBuilder()
      .setTitle("Recently tracked players")
      .setURL(tame.siteUrl("/tracked"))
      .setColor(0x8b6f47)
      .setDescription(description)
      .setFooter({ text: "stats.tame.gg/tracked", iconURL: tame.faviconUrl() });

    await interaction.editReply({ embeds: [embed] });
  },
};
recentCommand.json = recentCommand.data.toJSON();
