import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { getWatchesForUser, removeWatch } from "../db.ts";
import type { BotCommand } from "./types.ts";

export const unwatchCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("unwatch")
    .setDescription("Remove a player from your watchlist.")
    .addStringOption((option) =>
      option.setName("ign").setDescription("Watched player").setRequired(true).setAutocomplete(true),
    ),
  json: {} as never,
  async autocomplete(interaction) {
    const focused = String(interaction.options.getFocused()).toLowerCase();
    const choices = getWatchesForUser(interaction.user.id)
      .filter((watch) => watch.ign.toLowerCase().startsWith(focused))
      .slice(0, 25)
      // Autocomplete value is the UUID so removal is unambiguous even if the
      // user has two stale entries with different IGN cases for the same uuid.
      .map((watch) => ({ name: watch.ign, value: watch.uuid }));
    await interaction.respond(choices);
  },
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const value = interaction.options.getString("ign", true);
    const removedIgn = removeWatch(interaction.user.id, value);
    await interaction.editReply(
      removedIgn ? `Stopped watching **${removedIgn}**.` : "That player wasn't on your watchlist.",
    );
  },
};
unwatchCommand.json = unwatchCommand.data.toJSON();
