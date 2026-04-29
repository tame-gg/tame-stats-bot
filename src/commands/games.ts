import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
} from "discord.js";
import { tame, type BedwarsMode } from "../api/tame.ts";
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

/**
 * /bedwars mode-selector layout. Discord's ActionRow caps at 5 buttons,
 * so we split the 6 modes across two rows. Order matches the design
 * canvas — Overall first (default landing state), then Solo/Doubles in
 * the same row to keep the most-played core modes one click away.
 */
const BEDWARS_MODE_BUTTONS: ReadonlyArray<readonly BedwarsMode[]> = [
  ["overall", "solo", "doubles"],
  ["trios", "fours", "dreams"],
];

const BEDWARS_BUTTON_LABELS: Record<BedwarsMode, string> = {
  overall: "Overall",
  solo: "Solo",
  doubles: "Doubles",
  trios: "Trios",
  fours: "Fours",
  dreams: "Dreams",
};

/**
 * Build the two action rows for /bedwars. Pressed mode renders as Primary
 * (gold-accent in Discord's palette); the rest are Secondary.
 *
 * `customId` shape: `bw:mode:<uuid>:<mode>`. Includes the player's UUID so
 * the dispatcher can re-fetch the preview without round-tripping back to
 * the slash interaction. UUIDs are immutable; ign-renames don't break the
 * button until the message is re-rendered.
 */
export function buildBedwarsModeRows(
  uuid: string,
  pressed: BedwarsMode,
): ActionRowBuilder<ButtonBuilder>[] {
  return BEDWARS_MODE_BUTTONS.map((modes) => {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const mode of modes) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`bw:mode:${uuid}:${mode}`)
          .setLabel(BEDWARS_BUTTON_LABELS[mode])
          .setStyle(mode === pressed ? ButtonStyle.Primary : ButtonStyle.Secondary),
      );
    }
    return row;
  });
}

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

      const embed = buildGameEmbed(
        { ...preview, ign: resolved.ign },
        spec.gameId,
        spec.gameLabel,
        session,
      );

      // /bedwars ships with the mode-selector button rows under the embed;
      // Discord caps 5 buttons per row, so the 6 modes split across two.
      // Other game commands ship no buttons — they're stat-fixed.
      if (spec.gameId === "bedwars") {
        await interaction.editReply({
          embeds: [embed],
          components: buildBedwarsModeRows(preview.uuid, "overall"),
        });
      } else {
        await interaction.editReply({ embeds: [embed] });
      }
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
