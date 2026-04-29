import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { tame, type HypixelSession } from "../api/tame.ts";
import { getWatchesForUser } from "../db.ts";
import { THEME, codeBlock, padLeft, padRight, themeAuthor, themeFooter } from "../embeds/theme.ts";
import { compactSession, mapLimit } from "../util.ts";
import type { BotCommand } from "./types.ts";

const MAX_ROWS = 25;

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

    const rows = await mapLimit(watches.slice(0, MAX_ROWS), 5, async (watch) => {
      let session: HypixelSession | null = null;
      try {
        session = await tame.session(watch.uuid);
      } catch {
        session = null;
      }
      return { watch, session };
    });

    // Fixed-width codeblock format so columns line up:
    //   `<n>.  <ign>   <state>   <session-info>`
    // `●` for online, `○` for offline — bare ASCII-ish marks, no medal emoji
    // and no per-state coloring (the prompt is explicit about that).
    const rankWidth = String(rows.length).length + 1;
    const ignWidth = Math.min(16, Math.max(...rows.map((r) => r.watch.ign.length)));

    const lines = rows.map(({ watch, session }, index) => {
      const rank = padLeft(`${index + 1}.`, rankWidth);
      const ign = padRight(watch.ign, ignWidth);
      const dot = session?.online ? "●" : "○";
      const state = session?.online ? "online " : "offline";
      const detail = session?.online ? `· ${compactSession(session)}` : "";
      return `${rank}  ${dot} ${ign}   ${state}${detail ? `   ${detail}` : ""}`;
    });

    const embed = new EmbedBuilder()
      .setAuthor(themeAuthor("watchlist"))
      .setTitle(`${interaction.user.username}'s watchlist`)
      .setColor(THEME.sidebar)
      .setDescription(`*${watches.length} watched · DM alerts on log-on.*`)
      .addFields({ name: "​", value: codeBlock(lines), inline: false })
      .setFooter(themeFooter(null));

    await interaction.editReply({ embeds: [embed] });
  },
};
watchlistCommand.json = watchlistCommand.data.toJSON();
