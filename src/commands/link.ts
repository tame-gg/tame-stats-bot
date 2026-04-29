import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { tame } from "../api/tame.ts";
import { upsertLink } from "../db.ts";
import type { BotCommand } from "./types.ts";

export const linkCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link your Discord account to a Minecraft IGN.")
    .addStringOption((option) =>
      option.setName("ign").setDescription("Minecraft username").setRequired(true).setAutocomplete(true),
    ),
  json: {} as never,
  async autocomplete(interaction) {
    const focused = String(interaction.options.getFocused());
    const choices = await tame.search(focused);
    await interaction.respond(choices.slice(0, 25).map((p) => ({ name: p.ign, value: p.ign })));
  },
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const ign = interaction.options.getString("ign", true);
    const resolved = await tame.resolve(ign);
    if (!resolved) {
      await interaction.editReply("Couldn't find that player on Mojang.");
      return;
    }
    upsertLink(interaction.user.id, resolved.uuid, resolved.ign, interaction.guildId);
    await interaction.editReply(`Linked you to **${resolved.ign}**.`);
  },
};
linkCommand.json = linkCommand.data.toJSON();
