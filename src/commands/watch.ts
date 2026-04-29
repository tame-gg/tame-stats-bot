import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { tame } from "../api/tame.ts";
import { addWatch, countWatchesForUser } from "../db.ts";
import { log } from "../log.ts";
import { seedWatchedPlayer } from "../poller/index.ts";
import type { BotCommand } from "./types.ts";

const WATCH_LIMIT = 25;

export const watchCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("watch")
    .setDescription("Add a player to your watchlist (alerts you when they log on).")
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
    if (countWatchesForUser(userId) >= WATCH_LIMIT) {
      await interaction.editReply(
        `Watchlist is full (${WATCH_LIMIT} max). Use \`/unwatch\` to free a slot.`,
      );
      return;
    }

    const ign = interaction.options.getString("ign", true);
    const resolved = await tame.resolve(ign);
    if (!resolved) {
      await interaction.editReply(`Couldn't find **${ign}** on Mojang.`);
      return;
    }

    const inserted = addWatch(userId, resolved.uuid, resolved.ign);

    // Eagerly seed the poller so the very next tick can detect a transition.
    // Without this, /watch sees its first alert two ticks later (one to
    // baseline, one to detect the edge) — ~2 minutes lag.
    const session = await seedWatchedPlayer(resolved.uuid).catch(() => null);

    // Probe DM permissions so the user knows immediately whether alerts
    // will reach them. If their privacy settings block DMs from server
    // members, this fails and we tell them how to fix it.
    let dmStatus = "";
    try {
      await interaction.user.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x55ff55)
            .setDescription(
              `✦ Now watching **${resolved.ign}** — alerts will look like this when they log on.`,
            ),
        ],
      });
      dmStatus = "✓ DMs work — you'll get pings when they log on.";
    } catch (err) {
      log.debug({ err, userId }, "watch test DM failed");
      dmStatus =
        "⚠️ I can't DM you. Open Discord → Settings → Privacy & Safety → enable " +
        "**Allow direct messages from server members** for this server, or alerts won't reach you.";
    }

    const baseLine = inserted
      ? `Now watching **${resolved.ign}**.`
      : `**${resolved.ign}** is already on your watchlist.`;
    const stateLine = session?.online
      ? `They're online right now — you'll get an alert the next time they come back online after a logout.`
      : `They're offline. You'll get an alert the next time they log on.`;

    await interaction.editReply(`${baseLine} ${stateLine}\n\n${dmStatus}`);
  },
};
watchCommand.json = watchCommand.data.toJSON();
