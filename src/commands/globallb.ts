import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { tame, type GlobalLeaderboardRow } from "../api/tame.ts";
import { THEME, codeBlock, padLeft, padRight, themeAuthor, themeFooter } from "../embeds/theme.ts";
import {
  GLOBAL_LB_BUTTON_ROWS,
  GLOBAL_LB_GAMES,
  GLOBAL_LB_METRICS,
  globalLbGameLabel,
  globalLbMetricLabel,
  resolveGlobalLbGame,
  resolveGlobalLbMetric,
} from "../lib/global-leaderboard.ts";
import { formatNumber } from "../util.ts";
import type { BotCommand } from "./types.ts";

function formatLbValue(value: number, metric: string): string {
  if (!Number.isFinite(value)) return "—";
  const isWeeklyDelta = metric.startsWith("weekly:") || metric.startsWith("monthly:");
  const key = metric.replace(/^(weekly|monthly):/, "");
  const ratioKeys = new Set(["fkdr", "wlr", "bblr", "kdr", "melee_accuracy"]);
  const digits = ratioKeys.has(key) ? (key === "melee_accuracy" ? 1 : key === "fkdr" && isWeeklyDelta ? 3 : 2) : 0;
  const formatted = formatNumber(value, digits);
  if (isWeeklyDelta && value > 0 && !formatted.startsWith("-")) return `+${formatted}`;
  return formatted;
}

function secondaryLabel(metric: string): string | null {
  const key = metric.replace(/^(weekly|monthly):/, "");
  if (key === "fkdr" || key === "finalKills" || key === "finalDeaths") return "★";
  return null;
}

function buildGlobalLbUrl(game: string, metric: string): string {
  const params = new URLSearchParams({ game, metric, sort: "desc" });
  return tame.siteUrl(`/leaderboard?${params.toString()}`);
}

export function buildGlobalLbGameRows(
  pressedGame: string,
  metric: string,
): ActionRowBuilder<ButtonBuilder>[] {
  return GLOBAL_LB_BUTTON_ROWS.map((games) => {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const gameId of games) {
      const spec = GLOBAL_LB_GAMES.find((g) => g.id === gameId);
      if (!spec) continue;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`glb:game:${gameId}:${metric}`)
          .setLabel(spec.name)
          .setStyle(gameId === pressedGame ? ButtonStyle.Primary : ButtonStyle.Secondary),
      );
    }
    return row;
  });
}

export type GlobalLbRender =
  | { kind: "ok"; embed: EmbedBuilder; rows: ActionRowBuilder<ButtonBuilder>[] }
  | { kind: "empty"; message: string };

export async function renderGlobalLeaderboard(
  game: string,
  metric: string,
  limit: number,
): Promise<GlobalLbRender> {
  const gameSpec = resolveGlobalLbGame(game);
  const metricKey = resolveGlobalLbMetric(gameSpec, metric);

  const page = await tame.globalLeaderboard({
    game: gameSpec.id,
    metric: metricKey,
    limit,
  });

  const approxTotal = page.approxTotal ?? page.total;
  if (page.rows.length === 0 || approxTotal < 1) {
    return {
      kind: "empty",
      message: `No ${globalLbGameLabel(gameSpec.id)} ${globalLbMetricLabel(metricKey)} data on the tracked roster yet.`,
    };
  }

  const metricLabel = globalLbMetricLabel(metricKey);
  const secLabel = secondaryLabel(metricKey);
  const lines = formatGlobalLbLines(page.rows, metricKey, metricLabel, secLabel);

  const embed = new EmbedBuilder()
    .setAuthor(themeAuthor(`leaderboard · ${globalLbGameLabel(gameSpec.id).toLowerCase()}`))
    .setTitle(`${globalLbGameLabel(gameSpec.id)} · ${metricLabel}`)
    .setURL(buildGlobalLbUrl(gameSpec.id, metricKey))
    .setColor(THEME.sidebar)
    .setDescription(`*Global tracked roster, ranked by ${metricLabel.toLowerCase()} · ~${approxTotal.toLocaleString("en-US")} eligible.*`)
    .addFields({ name: "​", value: codeBlock(lines), inline: false })
    .setFooter(themeFooter("leaderboard"));

  return {
    kind: "ok",
    embed,
    rows: buildGlobalLbGameRows(gameSpec.id, metricKey),
  };
}

function formatGlobalLbLines(
  rows: GlobalLeaderboardRow[],
  metric: string,
  metricLabel: string,
  secLabel: string | null,
): string[] {
  const rankWidth = String(rows.length).length + 1;
  const ignWidth = Math.min(16, Math.max(...rows.map((r) => r.ign.length)));
  const valueStrs = rows.map((r) => formatLbValue(r.value, metric));
  const valueWidth = Math.max(...valueStrs.map((s) => s.length), metricLabel.length);

  return rows.map((row, index) => {
    const rank = padLeft(`${row.rank ?? index + 1}.`, rankWidth);
    const ign = padRight(row.ign, ignWidth);
    const value = padLeft(valueStrs[index] as string, valueWidth);
    const secondary =
      secLabel && row.secondary != null ? `   ${secLabel} ${formatNumber(row.secondary, 0)}` : "";
    return `${rank}  ${ign}   ${metricLabel} ${value}${secondary}`;
  });
}

export const globallbCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("globallb")
    .setDescription("Global tame.gg leaderboard — every tracked player, any game/metric.")
    .addStringOption((option) =>
      option
        .setName("game")
        .setDescription("Game mode")
        .setRequired(false)
        .addChoices(...GLOBAL_LB_GAMES.map((g) => ({ name: g.name, value: g.id }))),
    )
    .addStringOption((option) =>
      option
        .setName("metric")
        .setDescription("Metric to rank by")
        .setRequired(false)
        .addChoices(...GLOBAL_LB_METRICS.map((m) => ({ name: m.name, value: m.value }))),
    )
    .addIntegerOption((option) =>
      option.setName("limit").setDescription("How many rows (1–20, default 10)").setMinValue(1).setMaxValue(20),
    ),
  json: {} as never,
  async execute(interaction) {
    await interaction.deferReply();
    const gameSpec = resolveGlobalLbGame(interaction.options.getString("game"));
    const metric = resolveGlobalLbMetric(gameSpec, interaction.options.getString("metric"));
    const limit = interaction.options.getInteger("limit") ?? 10;

    const result = await renderGlobalLeaderboard(gameSpec.id, metric, limit);
    if (result.kind === "empty") {
      await interaction.editReply(result.message);
      return;
    }

    await interaction.editReply({ embeds: [result.embed], components: result.rows });
  },
};
globallbCommand.json = globallbCommand.data.toJSON();
