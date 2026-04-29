import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { tame } from "../api/tame.ts";
import { addWatch, countWatchesForUser } from "../db.ts";
import type { BotCommand } from "./types.ts";

export const watchCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("watch")
    .setDescription("Add a player to your watchlist.")
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
    const userId = interaction.user.id;
    if (countWatchesForUser(userId) >= 25) {
      await interaction.editReply("Watchlist is full (25 max). Use `/unwatch` to free a slot.");
      return;
    }

    const ign = interaction.options.getString("ign", true);
    const resolved = await tame.resolve(ign);
    if (!resolved) {
      await interaction.editReply("Couldn't find that player on Mojang.");
      return;
    }

    const inserted = addWatch(userId, resolved.uuid, resolved.ign);
    await interaction.editReply(
      inserted
        ? `Now watching **${resolved.ign}**.`
        : `**${resolved.ign}** is already on your watchlist.`,
    );
  },
};
watchCommand.json = watchCommand.data.toJSON();
