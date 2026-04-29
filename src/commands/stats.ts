import { SlashCommandBuilder } from "discord.js";
import { tame } from "../api/tame.ts";
import { buildPlayerEmbed } from "../embeds/player.ts";
import type { BotCommand } from "./types.ts";

export const statsCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Show a player's headline Hypixel stats.")
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
    await interaction.deferReply();
    const ign = interaction.options.getString("ign", true);
    const resolved = await tame.resolve(ign);
    if (!resolved) {
      await interaction.editReply(`Couldn't find **${ign}** on Mojang.`);
      return;
    }

    const [preview, session] = await Promise.all([
      // Auto-enrolls untracked players via tame.track() under the hood, so the
      // first call from any guild for a new IGN doesn't need a website round-trip.
      tame.previewOrTrack(resolved),
      // Session failures shouldn't block the stats embed — we still want to
      // render the OG image and metric tiles even if Hypixel /v2/status is down.
      tame.session(resolved.uuid).catch(() => ({ online: false }) as const),
    ]);
    if (!preview) {
      await interaction.editReply(
        `Couldn't track **${resolved.ign}** — Hypixel might be down or they have their API turned off.`,
      );
      return;
    }

    await interaction.editReply({
      embeds: [buildPlayerEmbed({ ...preview, ign: resolved.ign }, session)],
    });
  },
};
statsCommand.json = statsCommand.data.toJSON();
