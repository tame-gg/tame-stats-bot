import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { tame, type DenickerNickState } from "../api/tame.ts";
import { THEME, themeAuthor, themeFooter } from "../embeds/theme.ts";
import type { BotCommand } from "./types.ts";

function stateHeadline(state: DenickerNickState): string {
  switch (state) {
    case "likely_nicked":
      return "Likely nicked";
    case "real_account":
      return "Real account";
    case "uncertain":
      return "Uncertain";
    case "invalid_ign":
      return "Invalid IGN";
    case "api_error":
      return "Lookup failed";
  }
}

function stateColor(state: DenickerNickState): number {
  switch (state) {
    case "likely_nicked":
      return 0xb03030;
    case "real_account":
      return 0x46b47e;
    case "uncertain":
      return THEME.accent;
    default:
      return THEME.sidebar;
  }
}

export const denickerCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("denicker")
    .setDescription("Quick nick check — is this IGN a real Mojang account?")
    .addStringOption((option) =>
      option.setName("ign").setDescription("Minecraft username to check").setRequired(true),
    ),
  json: {} as never,
  async execute(interaction) {
    await interaction.deferReply();
    const ign = interaction.options.getString("ign", true);

    let result;
    try {
      result = await tame.denickerCheck(ign);
    } catch (err) {
      await interaction.editReply(
        err instanceof Error ? err.message : "Denicker lookup failed — try again shortly.",
      );
      return;
    }

    if (!result) {
      await interaction.editReply(`Couldn't check **${ign}** — invalid or empty IGN.`);
      return;
    }

    const embed = new EmbedBuilder()
      .setAuthor(themeAuthor("denicker"))
      .setTitle(`${result.ign} · ${stateHeadline(result.state)}`)
      .setURL(tame.siteUrl("/denicker"))
      .setColor(stateColor(result.state))
      .setDescription(result.message);

    if (result.mojangIgn && result.mojangIgn !== result.ign) {
      embed.addFields({ name: "Mojang name", value: result.mojangIgn, inline: true });
    }
    if (result.tips.length > 0) {
      embed.addFields({
        name: "Tips",
        value: result.tips.slice(0, 3).map((t) => `• ${t}`).join("\n"),
        inline: false,
      });
    }

    embed.setFooter(themeFooter("denicker"));
    await interaction.editReply({ embeds: [embed] });
  },
};
denickerCommand.json = denickerCommand.data.toJSON();
