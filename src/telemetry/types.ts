export type InteractionKind = "slash" | "autocomplete" | "button";

export type AuditEntry = {
  executedAt: number;
  interactionType: InteractionKind;
  commandName: string;
  discordUserId: string;
  discordUsername: string | null;
  guildId: string | null;
  guildName: string | null;
  channelId: string | null;
  optionsJson: Record<string, unknown> | null;
  success: boolean;
  errorMessage: string | null;
  durationMs: number;
};

export type RankedCount = { key: string; label?: string; count: number };

export type CommandStats = {
  name: string;
  count: number;
  failures: number;
  avgDurationMs: number;
  errorRate: number;
};

export type UserStats = {
  userId: string;
  username: string | null;
  count: number;
};

export type GuildStats = {
  guildId: string;
  name: string | null;
  count: number;
};

export type ApiCallStats = {
  tameBot: number;
  tameApp: number;
  tamePublic: number;
  total: number;
  failures: number;
  last24h: number;
};

export type TelemetrySnapshot = {
  commandsTotal: number;
  commands24h: number;
  commandsLastHour: number;
  failedCommandsTotal: number;
  failedCommands24h: number;
  autocompleteTotal: number;
  buttonClicksTotal: number;
  interactionTypes: { slash: number; autocomplete: number; button: number };
  commandsByHour: Array<{ hour: string; count: number }>;
  commandsByDay: Array<{ day: string; count: number }>;
  topCommands: CommandStats[];
  topUsers: UserStats[];
  topGuilds: GuildStats[];
  uniqueUsers24h: number;
  uniqueUsers7d: number;
  errorRateOverall: number;
  avgLatencyMs: number;
  avgLatencyByCommand: Array<{ name: string; avgMs: number }>;
  lastCommand: AuditEntry | null;
  guildJoinCount: number;
  guildLeaveCount: number;
  linkAddCount: number;
  linkRemoveCount: number;
  watchAddCount: number;
  watchRemoveCount: number;
  sessionStartedAt: number;
  sessionCount: number;
  peakMemoryMb: number;
  peakHeapMb: number;
  peakGuildCount: number;
  apiCalls: ApiCallStats;
  pollerTicks: number;
  pollerAlertsSent: number;
  pollerSessionErrors: number;
  dmFailuresTotal: number;
};
