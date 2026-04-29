import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { tame, type GuildMember } from "../api/tame.ts";
import { formatNumber } from "../util.ts";
import type { BotCommand } from "./types.ts";

function formatCreatedAt(seconds: number | null): string {
  if (!seconds) return "—";
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

/**
 * Sort members so the most useful ones surface first in a truncated list:
 * tracked-on-tame.gg before untracked, then by guild rank weight (officers
 * before plain members), then most-recently-joined last.
 */
const RANK_WEIGHT: Record<string, number> = {
  GUILDMASTER: 0,
  OWNER: 0,
  OFFICER: 1,
  MEMBER: 3,
};

function rankWeight(rank: string | null): number {
  if (!rank) return 4;
  const upper = rank.toUpperCase();
  if (upper in RANK_WEIGHT) return RANK_WEIGHT[upper]!;
  return 2; // custom rank — treated as between officer and member
}

function memberSortKey(m: GuildMember): [number, number, number] {
  return [
    m.ign ? 0 : 1,
    rankWeight(m.rank),
    m.joined !== null ? m.joined : Number.MAX_SAFE_INTEGER,
  ];
}

function compareMembers(a: GuildMember, b: GuildMember): number {
  const ka = memberSortKey(a);
  const kb = memberSortKey(b);
  for (let i = 0; i < ka.length; i++) {
    if (ka[i]! !== kb[i]!) return ka[i]! - kb[i]!;
  }
  return 0;
}

function memberLabel(m: GuildMember): string {
  // Tracked → bold + clickable to their tame.gg page.
  // Untracked → grey UUID stub so the user can spot un-enrolled members.
  if (m.ign) return `[**${m.ign}**](${tame.playerUrl(m.ign)})`;
  return `\`${m.uuid.slice(0, 8)}…\``;
}

const ROSTER_PREVIEW = 30;

function buildRosterText(members: readonly GuildMember[]): string | null {
  if (members.length === 0) return null;
  const sorted = [...members].sort(compareMembers);
  const head = sorted.slice(0, ROSTER_PREVIEW).map(memberLabel);
  const tail = sorted.length - head.length;
  const lines = head.join(", ");
  return tail > 0 ? `${lines}\n— and ${tail} more (open the link above)` : lines;
}

export const guildCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("guild")
    .setDescription("Look up a Hypixel guild by name OR by one of its players.")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("Guild name OR a member's Minecraft IGN")
        .setRequired(true),
    ),
  json: {} as never,
  async execute(interaction) {
    await interaction.deferReply();
    const query = interaction.options.getString("query", true);
    const guild = await tame.guild(query);

    if (!guild) {
      await interaction.editReply(
        `Couldn't find a guild matching **${query}** — neither a guild named that, nor a player with that IGN in any Hypixel guild.`,
      );
      return;
    }

    const url = tame.siteUrl(`/guild/${encodeURIComponent(guild.name)}`);
    const titleSuffix = guild.tag ? ` [${guild.tag}]` : "";

    const embed = new EmbedBuilder()
      .setTitle(`⛊ ${guild.name}${titleSuffix}`)
      .setURL(url)
      .setColor(0xe8b84a)
      .addFields(
        {
          name: "Members",
          value: `${formatNumber(guild.memberCount, 0)} (${formatNumber(guild.trackedCount, 0)} tracked)`,
          inline: true,
        },
        { name: "Guild XP", value: formatNumber(guild.exp, 0), inline: true },
        { name: "Created", value: formatCreatedAt(guild.createdAt), inline: true },
      )
      .setFooter({ text: `stats.tame.gg/guild/${guild.name}`, iconURL: tame.faviconUrl() });

    if (guild.description) {
      embed.setDescription(guild.description.slice(0, 500));
    }
    if (guild.preferredGames.length > 0) {
      embed.addFields({
        name: "Preferred games",
        value: guild.preferredGames.join(" · "),
        inline: false,
      });
    }

    const roster = buildRosterText(guild.members);
    if (roster) {
      // Field values cap at 1024; ROSTER_PREVIEW * ~30 chars/name fits.
      embed.addFields({
        name: `Roster (${guild.memberCount})`,
        value: roster.slice(0, 1024),
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
guildCommand.json = guildCommand.data.toJSON();
