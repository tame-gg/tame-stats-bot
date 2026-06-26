import type { HypixelSession } from "../api/tame.ts";

export type SessionChangeKind = "login" | "activity";

export type SessionChange = {
  kind: SessionChangeKind;
  /** Human-readable activity line for embeds. */
  label: string;
};

const GAME_LABELS: Record<string, string> = {
  BEDWARS: "Bedwars",
  SKYWARS: "Skywars",
  DUELS: "Duels",
  MURDER_MYSTERY: "Murder Mystery",
  BUILD_BATTLE: "Build Battle",
  MAIN: "Main Lobby",
  MAIN_LOBBY: "Main Lobby",
  LIMBO: "Limbo",
  HOUSING: "Housing",
};

const BEDWARS_MODE: Record<string, string> = {
  BEDWARS_EIGHT_ONE: "Solos",
  BEDWARS_EIGHT_TWO: "Doubles",
  BEDWARS_FOUR_THREE: "3v3v3v3",
  BEDWARS_FOUR_FOUR: "4v4v4v4",
  BEDWARS_TWO_FOUR: "4v4",
};

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function gameLabel(gameType?: string): string | null {
  if (!gameType) return null;
  return GAME_LABELS[gameType] ?? titleCase(gameType);
}

function modeLabel(gameType: string | undefined, mode: string | undefined): string | null {
  if (!mode) return null;
  if (mode === "LOBBY") return "Lobby";
  if (gameType === "BEDWARS" && BEDWARS_MODE[mode]) return BEDWARS_MODE[mode];
  return titleCase(mode);
}

/** Stable fingerprint for comparing Hypixel session snapshots. */
export function sessionFingerprint(session: HypixelSession): string {
  if (!session.online) return "offline";
  return [session.gameType ?? "", session.mode ?? "", session.map ?? ""].join("|");
}

/** Describe what a player is doing for alert copy. */
export function describeSessionActivity(session: HypixelSession): string {
  if (!session.online) return "Offline";

  const game = session.gameType ?? "";
  const mode = session.mode ?? "";

  if (game === "LIMBO") return "In Limbo — queueing for a game";
  if (mode === "LOBBY") {
    const label = gameLabel(game);
    return label ? `In ${label} lobby — likely queueing` : "In a lobby — likely queueing";
  }

  const parts = [gameLabel(game), modeLabel(game, mode), session.map ? titleCase(session.map) : null].filter(
    Boolean,
  );
  if (parts.length === 0) return "Online on Hypixel";
  return `Playing ${parts.join(" · ")}`;
}

export function detectSessionChanges(
  previous: HypixelSession | undefined,
  next: HypixelSession,
): SessionChange[] {
  if (!previous) {
    return next.online ? [{ kind: "login", label: describeSessionActivity(next) }] : [];
  }

  if (!previous.online && next.online) {
    return [{ kind: "login", label: describeSessionActivity(next) }];
  }

  if (previous.online && next.online && sessionFingerprint(previous) !== sessionFingerprint(next)) {
    return [{ kind: "activity", label: describeSessionActivity(next) }];
  }

  return [];
}

export function alertDescription(change: SessionChange): string {
  if (change.kind === "login") {
    return change.label === "Online on Hypixel"
      ? "*Just logged on.*"
      : `*Just logged on — ${change.label.charAt(0).toLowerCase()}${change.label.slice(1)}.*`;
  }
  return `*${change.label}.*`;
}
