import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { tame, type HypixelSession } from "../api/tame.ts";
import { getWatchesForUser } from "../db.ts";
import { compactSession, mapLimit } from "../util.ts";
import type { BotCommand } from "./types.ts";

// Discord caps embed fields at 25, and the in-app /watch limit is also 25,
// so this matches by construction. Slicing is just paranoia in case the cap
// ever changes upstream.
const MAX_FIELDS = 25;

export const watchlistCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("watchlist").setDescription("Show your watchlist and online states."),
  json: {} as never,
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const watches = getWatchesForUser(interaction.user.id);
    if (watches.length === 0) {
      await interaction.editReply("Your watchlist is empty. Use `/watch <ign>` to add someone.");
      return;
    }

    const rows = await mapLimit(watches.slice(0, MAX_FIELDS), 5, async (watch) => {
      let session: HypixelSession | null = null;
      try {
        session = await tame.session(watch.uuid);
      } catch {
        session = null;
      }
      return { watch, session };
    });

    const embed = new EmbedBuilder()
      .setTitle(`${interaction.user.username}'s watchlist`)
      .setColor(0x8b6f47)
      .addFields(
        rows.map(({ watch, session }) => ({
          name: `${session?.online ? "🟢" : "⚫"} ${watch.ign}`,
          value: compactSession(session),
          inline: true,
        })),
      )
      .setFooter({ text: `${watches.length} watched · stats.tame.gg`, iconURL: tame.faviconUrl() });

    await interaction.editReply({ embeds: [embed] });
  },
};
watchlistCommand.json = watchlistCommand.data.toJSON();
