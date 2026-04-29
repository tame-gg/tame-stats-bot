import type { AutocompleteInteraction, ChatInputCommandInteraction } from "discord.js";
import { compareCommand } from "./compare.ts";
import { gameCommands, hypixelCommand } from "./games.ts";
import { guildCommand } from "./guild.ts";
import { leaderboardCommand } from "./leaderboard.ts";
import { linkCommand } from "./link.ts";
import { liveCommand } from "./live.ts";
import { recentCommand } from "./recent.ts";
import { serverStatusCommand } from "./serverstatus.ts";
import { statsCommand } from "./stats.ts";
import { topPlayersCommand } from "./topplayers.ts";
import { unlinkCommand } from "./unlink.ts";
import { unwatchCommand } from "./unwatch.ts";
import { watchCommand } from "./watch.ts";
import { watchlistCommand } from "./watchlist.ts";
import type { BotCommand } from "./types.ts";

export const commands: BotCommand[] = [
  statsCommand,
  hypixelCommand,
  ...gameCommands,
  compareCommand,
  liveCommand,
  guildCommand,
  topPlayersCommand,
  recentCommand,
  serverStatusCommand,
  watchCommand,
  unwatchCommand,
  watchlistCommand,
  linkCommand,
  unlinkCommand,
  leaderboardCommand,
];

const commandByName = new Map(commands.map((command) => [command.data.name, command]));

export async function dispatchCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const command = commandByName.get(interaction.commandName);
  if (!command) {
    await interaction.reply({ content: "Unknown command.", ephemeral: true });
    return;
  }
  await command.execute(interaction);
}

export async function dispatchAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const command = commandByName.get(interaction.commandName);
  if (!command?.autocomplete) {
    await interaction.respond([]);
    return;
  }
  await command.autocomplete(interaction);
}
