import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { tame } from "../api/tame.ts";
import { formatNumber } from "../util.ts";
import type { BotCommand } from "./types.ts";

function formatCreatedAt(seconds: number | null): string {
  if (!seconds) return "—";
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

export const guildCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("guild")
    .setDescription("Look up a Hypixel guild by name.")
    .addStringOption((option) =>
      option.setName("name").setDescription("Guild name (case-insensitive)").setRequired(true),
    ),
  json: {} as never,
  async execute(interaction) {
    await interaction.deferReply();
    const name = interaction.options.getString("name", true);
    const guild = await tame.guild(name);

    if (!guild) {
      await interaction.editReply(`Couldn't find a guild named **${name}** on Hypixel.`);
      return;
    }

    const url = tame.siteUrl(`/guild/${encodeURIComponent(guild.name)}`);
    const titleSuffix = guild.tag ? ` [${guild.tag}]` : "";

    const embed = new EmbedBuilder()
      .setTitle(`⛊ ${guild.name}${titleSuffix}`)
      .setURL(url)
      .setColor(0xe8b84a)
      .addFields(
        { name: "Members", value: formatNumber(guild.memberCount, 0), inline: true },
        { name: "Guild XP", value: formatNumber(guild.exp, 0), inline: true },
        { name: "Created", value: formatCreatedAt(guild.createdAt), inline: true },
      )
      .setFooter({ text: "stats.tame.gg/guild/" + guild.name, iconURL: tame.faviconUrl() });

    if (guild.description) {
      embed.setDescription(guild.description.slice(0, 500));
    }
    if (guild.preferredGames.length > 0) {
      embed.addFields({
        name: "Preferred games",
        value: guild.preferredGames.join(" · "),
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
guildCommand.json = guildCommand.data.toJSON();
