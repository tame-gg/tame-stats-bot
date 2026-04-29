import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { tame } from "../api/tame.ts";
import { compactSession } from "../util.ts";
import type { BotCommand } from "./types.ts";

export const liveCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("live")
    .setDescription("Show a player's current Hypixel session + a link to their live tracker.")
    .addStringOption((option) =>
      option
        .setName("ign")
        .setDescription("Minecraft username")
        .setRequired(true)
        .setAutocomplete(true),
    ),
  json: {} as never,
  async autocomplete(interaction) {
    const focused = String(interaction.options.getFocused());
    const choices = await tame.search(focused);
    await interaction.respond(choices.slice(0, 25).map((p) => ({ name: p.ign, value: p.ign })));
  },
  async execute(interaction) {
    await interaction.deferReply();
    const ign = interaction.options.getString("ign", true);
    const resolved = await tame.resolve(ign);
    if (!resolved) {
      await interaction.editReply(`Couldn't find **${ign}** on Mojang.`);
      return;
    }

    const session = await tame.session(resolved.uuid);
    const dot = session.online ? "🟢" : "⚫";

    const embed = new EmbedBuilder()
      .setTitle(`${dot} ${resolved.ign}`)
      .setURL(tame.liveUrl(resolved.ign))
      .setColor(session.online ? 0x55ff55 : 0x8b6f47)
      .setDescription(compactSession(session))
      .setFooter({ text: `stats.tame.gg/${resolved.ign}/live`, iconURL: tame.faviconUrl() });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel("Open live tracker")
        .setStyle(ButtonStyle.Link)
        .setURL(tame.liveUrl(resolved.ign)),
      new ButtonBuilder()
        .setLabel("Profile")
        .setStyle(ButtonStyle.Link)
        .setURL(tame.playerUrl(resolved.ign)),
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
  },
};
liveCommand.json = liveCommand.data.toJSON();
