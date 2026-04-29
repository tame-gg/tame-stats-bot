import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { deleteLink } from "../db.ts";
import type { BotCommand } from "./types.ts";

export const unlinkCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("unlink").setDescription("Clear your linked Minecraft account."),
  json: {} as never,
  async execute(interaction) {
    const removed = deleteLink(interaction.user.id);
    await interaction.reply({
      content: removed ? "Your link has been cleared." : "You didn't have a linked IGN.",
      flags: MessageFlags.Ephemeral,
    });
  },
};
unlinkCommand.json = unlinkCommand.data.toJSON();
