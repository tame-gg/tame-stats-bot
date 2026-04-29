import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { tame } from "../api/tame.ts";
import { deleteLink } from "../db.ts";
import { log } from "../log.ts";
import type { BotCommand } from "./types.ts";

export const unlinkCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("unlink").setDescription("Clear your linked Minecraft account."),
  json: {} as never,
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const removed = deleteLink(interaction.user.id);

    // Mirror to the website regardless of local outcome — the row may be
    // there from a previous deploy even if the local SQLite was wiped.
    // Endpoint is idempotent (always 200), so a missing row is fine.
    try {
      await tame.removeDiscordLink(interaction.user.id);
    } catch (err) {
      log.warn({ err, userId: interaction.user.id }, "discord-link mirror delete failed");
    }

    await interaction.editReply(
      removed ? "Your link has been cleared." : "You didn't have a linked IGN.",
    );
  },
};
unlinkCommand.json = unlinkCommand.data.toJSON();
