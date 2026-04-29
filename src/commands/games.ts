import { SlashCommandBuilder } from "discord.js";
import { tame } from "../api/tame.ts";
import { buildGameEmbed, buildHypixelOverviewEmbed } from "../embeds/game.ts";
import { resolveCommandTarget } from "./target.ts";
import type { BotCommand } from "./types.ts";

type GameSpec = {
  /** slash command name, must match `^[\w-]{1,32}$` */
  command: string;
  description: string;
  /** matches `PreviewGame.id` from the /api/preview/{uuid} response */
  gameId: string;
  /** display label */
  gameLabel: string;
};

// Game ids match what `lib/player-preview.ts` emits in PREVIEW_GAMES.
const GAMES: GameSpec[] = [
  { command: "bedwars", description: "Show a player's Bedwars stats.", gameId: "bedwars", gameLabel: "Bedwars" },
  { command: "skywars", description: "Show a player's Skywars stats.", gameId: "skywars", gameLabel: "Skywars" },
  { command: "duels", description: "Show a player's Duels stats.", gameId: "duels", gameLabel: "Duels" },
  {
    command: "murdermystery",
    description: "Show a player's Murder Mystery stats.",
    gameId: "murder_mystery",
    gameLabel: "Murder Mystery",
  },
  {
    command: "buildbattle",
    description: "Show a player's Build Battle stats.",
    gameId: "build_battle",
    gameLabel: "Build Battle",
  },
];

function makeGameCommand(spec: GameSpec): BotCommand {
  const data = new SlashCommandBuilder()
    .setName(spec.command)
    .setDescription(`${spec.description} Defaults to your linked account.`)
    .addStringOption((option) =>
      option
        .setName("ign")
        .setDescription("Minecraft username (defaults to your linked account)")
        .setRequired(false)
        .setAutocomplete(true),
    );

  const cmd: BotCommand = {
    data,
    json: {} as never,
    async autocomplete(interaction) {
      const focused = String(interaction.options.getFocused());
      const choices = await tame.search(focused);
      await interaction.respond(choices.slice(0, 25).map((p) => ({ name: p.ign, value: p.ign })));
    },
    async execute(interaction) {
      await interaction.deferReply();
      const target = await resolveCommandTarget(interaction);
      if (target.kind === "error") {
        await interaction.editReply(target.message);
        return;
      }
      const resolved = target.player;

      const [preview, session] = await Promise.all([
        tame.previewOrTrack(resolved),
        tame.session(resolved.uuid).catch(() => ({ online: false }) as const),
      ]);
      if (!preview) {
        await interaction.editReply(
          `Couldn't track **${resolved.ign}** — Hypixel might be down or they have their API turned off.`,
        );
        return;
      }

      await interaction.editReply({
        embeds: [
          buildGameEmbed({ ...preview, ign: resolved.ign }, spec.gameId, spec.gameLabel, session),
        ],
      });
    },
  };
  cmd.json = data.toJSON();
  return cmd;
}

export const gameCommands: BotCommand[] = GAMES.map(makeGameCommand);

// /hypixel — the network-overview command, distinct shape from the per-game
// commands so it gets its own definition rather than passing through the
// factory.
const hypixelData = new SlashCommandBuilder()
  .setName("hypixel")
  .setDescription("Show a player's Hypixel network overview. Defaults to your linked account.")
  .addStringOption((option) =>
    option
      .setName("ign")
      .setDescription("Minecraft username (defaults to your linked account)")
      .setRequired(false)
      .setAutocomplete(true),
  );

export const hypixelCommand: BotCommand = {
  data: hypixelData,
  json: {} as never,
  async autocomplete(interaction) {
    const focused = String(interaction.options.getFocused());
    const choices = await tame.search(focused);
    await interaction.respond(choices.slice(0, 25).map((p) => ({ name: p.ign, value: p.ign })));
  },
  async execute(interaction) {
    await interaction.deferReply();
    const target = await resolveCommandTarget(interaction);
    if (target.kind === "error") {
      await interaction.editReply(target.message);
      return;
    }
    const resolved = target.player;

    const [preview, session] = await Promise.all([
      tame.previewOrTrack(resolved),
      tame.session(resolved.uuid).catch(() => ({ online: false }) as const),
    ]);
    if (!preview) {
      await interaction.editReply(
        `Couldn't track **${resolved.ign}** — Hypixel might be down or they have their API turned off.`,
      );
      return;
    }

    await interaction.editReply({
      embeds: [buildHypixelOverviewEmbed({ ...preview, ign: resolved.ign }, session)],
    });
  },
};
hypixelCommand.json = hypixelData.toJSON();
