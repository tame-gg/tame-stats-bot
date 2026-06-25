import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { tame } from "../api/tame.ts";
import { THEME, themeAuthor, themeFooter } from "../embeds/theme.ts";
import type { BotCommand } from "./types.ts";

const LINKS = {
  site: "https://lilith.rip",
  docs: "https://docs.lilith.rip",
  discord: "https://discord.gg/GzNhP5SjBR",
  purchase: "https://me.lilith.rip/",
} as const;

export const lilithCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("lilith")
    .setDescription("About Lilith — tame.gg's partner Hypixel proxy (stats in-game)."),
  json: {} as never,
  async execute(interaction) {
    await interaction.deferReply();

    const embed = new EmbedBuilder()
      .setAuthor(themeAuthor("lilith"))
      .setTitle("Lilith — all-in-one Hypixel proxy")
      .setURL(tame.siteUrl("/lilith"))
      .setColor(THEME.accent)
      .setDescription(
        [
          "*Partner linked from tame.gg/stats.*",
          "",
          "Lilith sits between your client and Hypixel to surface stats in-game:",
          "• **In-game stat checking** — `/sc <player>` style lookups",
          "• **Player-list stats** — W/L and FKDR on the tab list",
          "• **Queue stats** — auto-scan every player when the match starts",
          "",
          "**Supported games:** BedWars, SkyWars, Duels, WoolWars and more.",
        ].join("\n"),
      )
      .addFields(
        { name: "Download", value: `[lilith.rip](${LINKS.site})`, inline: true },
        { name: "Docs", value: `[docs.lilith.rip](${LINKS.docs})`, inline: true },
        { name: "Discord", value: `[Join server](${LINKS.discord})`, inline: true },
        {
          name: "Pricing",
          value: `Free tier · Pro $5/mo · Ultimate $10/mo — [purchase](${LINKS.purchase})`,
          inline: false,
        },
      )
      .setFooter(themeFooter("lilith"));

    await interaction.editReply({ embeds: [embed] });
  },
};
lilithCommand.json = lilithCommand.data.toJSON();
