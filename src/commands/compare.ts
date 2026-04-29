import { SlashCommandBuilder } from "discord.js";
import { tame } from "../api/tame.ts";
import { buildCompareEmbed } from "../embeds/compare.ts";
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

    // Pull previews concurrently for the FKDR text row. Each preview is null
    // when the player hasn't been tracked yet — the embed handles that.
    const previewSettled = await Promise.allSettled(resolved.map((p) => tame.preview(p.uuid)));
    const previews = previewSettled.map((r) => (r.status === "fulfilled" ? r.value : null));

    await interaction.editReply({
      embeds: [buildCompareEmbed(resolved.map((p) => p.ign), previews)],
    });
  }
};
compareCommand.json = compareCommand.data.toJSON();
