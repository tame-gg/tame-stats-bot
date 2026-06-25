import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { tame, TameApiError, type DenickerNickState } from "../api/tame.ts";
import { THEME, themeAuthor, themeFooter } from "../embeds/theme.ts";
import type { BotCommand } from "./types.ts";

/** Mirror tame.gg's `isValidIgn` so we reject junk before a wasted API hop. */
const IGN_PATTERN = /^[A-Za-z0-9_]{1,16}$/;

/** Map the denicker endpoint's error surface to a friendly, actionable line. */
function denickerErrorMessage(err: unknown): string {
  if (err instanceof TameApiError) {
    if (err.status === 400) return "That doesn't look like a valid Minecraft username.";
    if (err.status === 429) return "Denicker is rate limited right now — try again in a minute.";
    if (err.status === 503 || err.kind === "server") {
      return "Denicker is temporarily unavailable — try again shortly.";
    }
    if (err.kind === "timeout" || err.kind === "network") {
      return "tame.gg looks unreachable right now — try again in a moment.";
    }
  }
  return "Denicker lookup failed — try again shortly.";
}

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
    const ign = interaction.options.getString("ign", true).trim();

    if (!IGN_PATTERN.test(ign)) {
      await interaction.editReply(
        `**${ign.slice(0, 32) || "(empty)"}** isn't a valid Minecraft username (1–16 letters, numbers or underscores).`,
      );
      return;
    }

    let result;
    try {
      result = await tame.denickerCheck(ign);
    } catch (err) {
      await interaction.editReply(denickerErrorMessage(err));
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
