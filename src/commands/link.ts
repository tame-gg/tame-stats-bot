import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { tame } from "../api/tame.ts";
import { upsertLink } from "../db.ts";
import { log } from "../log.ts";
import type { BotCommand } from "./types.ts";

/**
 * Strip leading `@` and surrounding whitespace, then lowercase. Hypixel
 * stores socials as the user typed them, so we tolerate "@asianrizz",
 * "AsianRizz", " asianrizz ", etc.
 */
function normalizeDiscordHandle(raw: string): string {
  return raw.replace(/^@+/, "").trim().toLowerCase();
}

export const linkCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link your Discord account to a Minecraft IGN (verified via Hypixel /socials).")
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

    let socials: Awaited<ReturnType<typeof tame.socials>> = null;
    try {
      socials = await tame.socials(ign);
    } catch (err) {
      log.warn({ err, ign }, "tame.socials failed");
      await interaction.editReply(
        "Couldn't reach Hypixel to verify the link. Try again in a moment.",
      );
      return;
    }

    if (!socials) {
      await interaction.editReply(`Couldn't find **${ign}** on Mojang.`);
      return;
    }

    if (!socials.discord) {
      await interaction.editReply(
        `**${socials.ign}** doesn't have a Discord set on Hypixel.\n` +
          `In Minecraft, run \`/socials\` and set your Discord to \`${interaction.user.username}\`. Then re-run /link.`,
      );
      return;
    }

    // Discord usernames went one-handle in 2023; legacy users still have a
    // discriminator. Accept either format so people who set their Hypixel
    // social to "user#1234" before the migration aren't stuck.
    const expected = new Set([
      normalizeDiscordHandle(interaction.user.username),
      normalizeDiscordHandle(interaction.user.tag),
    ]);
    const observed = normalizeDiscordHandle(socials.discord);

    if (!expected.has(observed)) {
      await interaction.editReply(
        `Verification failed. **${socials.ign}** has \`${socials.discord}\` set as their Discord on Hypixel — that doesn't match your username \`${interaction.user.username}\`.\n` +
          `Fix: in Minecraft, run \`/socials\` and set Discord to \`${interaction.user.username}\`. Then re-run /link.`,
      );
      return;
    }

    upsertLink(interaction.user.id, socials.uuid, socials.ign, interaction.guildId);
    await interaction.editReply(
      `Linked you to **${socials.ign}** ✓ (verified via Hypixel /socials)`,
    );
  },
};
linkCommand.json = linkCommand.data.toJSON();
