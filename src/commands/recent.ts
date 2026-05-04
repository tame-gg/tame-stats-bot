import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { tame } from "../api/tame.ts";
import { THEME, codeBlock, padLeft, padRight, themeAuthor, themeFooter } from "../embeds/theme.ts";
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
    .setDescription("Show the most recently tracked players on tame.gg/stats.")
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

    // Fixed-width columns so the codeblock's monospace keeps things aligned.
    const widestRank = String(rows.length).length + 1; // "10." → 3
    const ignWidth = Math.min(16, Math.max(...rows.map((r) => r.ign.length)));
    const ages = rows.map((r) => relativeAge(r.addedAt));
    const ageWidth = Math.max(...ages.map((a) => a.length));

    const lines = rows.map((row, index) => {
      const rank = padLeft(`${index + 1}.`, widestRank);
      const ign = padRight(row.ign, ignWidth);
      const age = padLeft(ages[index] as string, ageWidth);
      return `${rank}  ${ign}   added ${age}`;
    });

    const embed = new EmbedBuilder()
      .setAuthor(themeAuthor("recent"))
      .setTitle("Recently tracked players")
      .setURL(tame.siteUrl("/tracked"))
      .setColor(THEME.sidebar)
      .setDescription("*Newest entries on the tame.gg roster.*")
      .addFields({ name: "​", value: codeBlock(lines), inline: false })
      .setFooter(themeFooter("tracked"));

    await interaction.editReply({ embeds: [embed] });
  },
};
recentCommand.json = recentCommand.data.toJSON();
