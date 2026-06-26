import { ActivityType, type Client } from "discord.js";

export type PresenceConfig = {
  status: "online" | "idle" | "dnd" | "invisible";
  activityType: "playing" | "watching" | "listening" | "streaming" | "competing" | "custom";
  activityMessage: string;
  updatedAt: number;
};

const ACTIVITY_TYPE_MAP: Record<PresenceConfig["activityType"], ActivityType> = {
  playing: ActivityType.Playing,
  watching: ActivityType.Watching,
  listening: ActivityType.Listening,
  streaming: ActivityType.Streaming,
  competing: ActivityType.Competing,
  custom: ActivityType.Custom,
};

let lastAppliedUpdatedAt = -1;

export function applyPresenceConfig(client: Client<true>, config: PresenceConfig): void {
  if (config.updatedAt <= lastAppliedUpdatedAt) return;
  lastAppliedUpdatedAt = config.updatedAt;

  const activityType = ACTIVITY_TYPE_MAP[config.activityType] ?? ActivityType.Watching;
  const message = config.activityMessage.trim() || "Hypixel stats";

  const activities =
    config.activityType === "custom"
      ? [{ name: "Custom Status", type: ActivityType.Custom, state: message }]
      : config.activityType === "streaming"
        ? [{ name: message, type: ActivityType.Streaming, url: "https://www.twitch.tv/tamegg" }]
        : [{ name: message, type: activityType }];

  client.user.setPresence({
    status: config.status,
    activities,
  });
}

export function resetPresenceApplyState(): void {
  lastAppliedUpdatedAt = -1;
}
