/**
 * Game + metric catalog for `/globallb`, mirroring tame.gg/stats/leaderboard.
 * Metric keys match `?metric=` on `/api/leaderboard`; the server falls back
 * when a metric isn't valid for the chosen game.
 */
export type GlobalLbGameSpec = {
  id: string;
  name: string;
  /** Default `?metric=` when the slash option is omitted. */
  defaultMetric: string;
};

export const GLOBAL_LB_GAMES: GlobalLbGameSpec[] = [
  { id: "bedwars", name: "Bedwars", defaultMetric: "fkdr" },
  { id: "skywars", name: "Skywars", defaultMetric: "kdr" },
  { id: "duels", name: "Duels", defaultMetric: "wins" },
  { id: "murder_mystery", name: "Murder Mystery", defaultMetric: "wins" },
  { id: "build_battle", name: "Build Battle", defaultMetric: "score" },
  { id: "network", name: "Network", defaultMetric: "level" },
  { id: "pit", name: "The Pit", defaultMetric: "prestige" },
  { id: "uhc", name: "UHC Champions", defaultMetric: "score" },
  { id: "speed_uhc", name: "Speed UHC", defaultMetric: "score" },
  { id: "mega_walls", name: "Mega Walls", defaultMetric: "wins" },
  { id: "blitz", name: "Blitz SG", defaultMetric: "wins" },
  { id: "arcade", name: "Arcade", defaultMetric: "wins" },
  { id: "wool_games", name: "Wool Wars", defaultMetric: "wins" },
  { id: "smash_heroes", name: "Smash Heroes", defaultMetric: "wins" },
  { id: "cops_and_crims", name: "Cops and Crims", defaultMetric: "wins" },
  { id: "warlords", name: "Warlords", defaultMetric: "wins" },
  { id: "vampirez", name: "VampireZ", defaultMetric: "wins" },
  { id: "quake", name: "Quake", defaultMetric: "wins" },
  { id: "paintball", name: "Paintball", defaultMetric: "wins" },
  { id: "walls", name: "Walls", defaultMetric: "wins" },
  { id: "tnt_games", name: "TNT Games", defaultMetric: "wins" },
  { id: "turbo_kart_racers", name: "Turbo Kart Racers", defaultMetric: "wins" },
];

export const GLOBAL_LB_METRICS = [
  { value: "fkdr", name: "FKDR" },
  { value: "wlr", name: "WLR" },
  { value: "bblr", name: "BBLR" },
  { value: "star", name: "Star" },
  { value: "wins", name: "Wins" },
  { value: "kdr", name: "KDR" },
  { value: "kills", name: "Kills" },
  { value: "score", name: "Score" },
  { value: "level", name: "Network Level" },
  { value: "finalKills", name: "Final Kills" },
  { value: "finalDeaths", name: "Final Deaths" },
  { value: "prestige", name: "Prestige" },
  { value: "melee_accuracy", name: "Melee %" },
  { value: "weekly:star", name: "Weekly Stars" },
  { value: "weekly:fkdr", name: "Weekly FKDR Δ" },
  { value: "monthly:star", name: "Monthly Stars" },
] as const;

const GAME_BY_ID = new Map(GLOBAL_LB_GAMES.map((g) => [g.id, g]));
const METRIC_BY_VALUE = new Map<string, string>(
  GLOBAL_LB_METRICS.map((m) => [m.value, m.name]),
);

export function globalLbGameLabel(id: string): string {
  return GAME_BY_ID.get(id)?.name ?? id.replaceAll("_", " ");
}

export function globalLbMetricLabel(metric: string): string {
  return METRIC_BY_VALUE.get(metric) ?? metric.replace(/^weekly:/, "Weekly ").replace(/^monthly:/, "Monthly ");
}

export function resolveGlobalLbGame(id: string | null): GlobalLbGameSpec {
  if (id && GAME_BY_ID.has(id)) return GAME_BY_ID.get(id)!;
  return GLOBAL_LB_GAMES[0]!;
}

export function resolveGlobalLbMetric(game: GlobalLbGameSpec, metric: string | null): string {
  if (metric) return metric;
  return game.defaultMetric;
}

/** Split game buttons across Discord's 5-row / 5-button-per-row cap. */
export const GLOBAL_LB_BUTTON_ROWS: readonly (readonly string[])[] = [
  ["bedwars", "skywars", "duels", "murder_mystery", "build_battle"],
  ["network", "pit", "uhc", "speed_uhc", "mega_walls"],
  ["blitz", "arcade", "wool_games", "smash_heroes", "cops_and_crims"],
  ["warlords", "vampirez", "quake", "paintball", "walls"],
  ["tnt_games", "turbo_kart_racers"],
];
