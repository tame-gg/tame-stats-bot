import { SlashCommandBuilder } from "discord.js";
import { tame } from "../api/tame.ts";
import { buildCompareEmbed } from "../embeds/compare.ts";
import { mapLimit } from "../util.ts";
import type { BotCommand } from "./types.ts";

const builder = new SlashCommandBuilder()
  .setName("compare")
  .setDescription("Compare two to four players.")
  .addStringOption((option) =>
    option.setName("ign1").setDescription("Minecraft username").setRequired(true).setAutocomplete(true)
  )
  .addStringOption((option) =>
    option.setName("ign2").setDescription("Minecraft username").setRequired(true).setAutocomplete(true)
  )
  .addStringOption((option) =>
    option.setName("ign3").setDescription("Minecraft username").setRequired(false).setAutocomplete(true)
  )
  .addStringOption((option) =>
    option.setName("ign4").setDescription("Minecraft username").setRequired(false).setAutocomplete(true)
  );

export const compareCommand: BotCommand = {
  data: builder,
  json: {} as never,
  async autocomplete(interaction) {
    const focused = String(interaction.options.getFocused());
    const choices = await tame.search(focused);
    await interaction.respond(choices.slice(0, 25).map((p) => ({ name: p.ign, value: p.ign })));
  },
  async execute(interaction) {
    await interaction.deferReply();
    const raw = ["ign1", "ign2", "ign3", "ign4"]
      .map((name) => interaction.options.getString(name))
      .filter((value): value is string => !!value);

    const resolveSettled = await Promise.allSettled(raw.map((ign) => tame.resolve(ign)));
    const resolved = resolveSettled
      .map((result) => (result.status === "fulfilled" ? result.value : null))
      .filter((value): value is { uuid: string; ign: string } => !!value);

    if (resolved.length < 2) {
      await interaction.editReply("I need at least two resolvable players to compare.");
      return;
    }

    // Pull previews with modest concurrency so compare doesn't burst the
    // preview rate limit when four players are requested at once.
    const previews = await mapLimit(resolved, 2, async (player) => tame.previewLive(player.uuid));
    await interaction.editReply({
      embeds: [buildCompareEmbed(resolved.map((p) => p.ign), previews)],
    });
  }
};
compareCommand.json = compareCommand.data.toJSON();
