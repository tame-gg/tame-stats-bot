import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { tame } from "../api/tame.ts";
import { THEME, themeAuthor, themeFooter } from "../embeds/theme.ts";
import { compactSession } from "../util.ts";
import { resolveCommandTarget } from "./target.ts";
import type { BotCommand } from "./types.ts";

export const liveCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("live")
    .setDescription("Show a player's current Hypixel session. Defaults to your linked account.")
    .addStringOption((option) =>
      option
        .setName("ign")
        .setDescription("Minecraft username (defaults to your linked account)")
        .setRequired(false)
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
    const target = await resolveCommandTarget(interaction);
    if (target.kind === "error") {
      await interaction.editReply(target.message);
      return;
    }
    const resolved = target.player;

    const session = await tame.session(resolved.uuid);

    // /live is online-state-focused, not player-focused — sidebar is the
    // ink default. Online vs. offline reads through the description ("●"
    // marker + italic state line) rather than a green/red sidebar.
    const dot = session.online ? "●" : "○";
    const stateLine = session.online ? `*${compactSession(session)}.*` : `*Offline.*`;

    const embed = new EmbedBuilder()
      .setAuthor(themeAuthor("live"))
      .setTitle(`${dot}  ${resolved.ign}`)
      .setURL(tame.liveUrl(resolved.ign))
      .setColor(THEME.sidebar)
      .setDescription(stateLine)
      .setFooter(themeFooter(`${resolved.ign}/live`));

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
