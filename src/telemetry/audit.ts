import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
} from "discord.js";
import type { AuditEntry, InteractionKind } from "./types.ts";
import { insertAudit } from "./store.ts";

function extractSlashOptions(
  interaction: ChatInputCommandInteraction | AutocompleteInteraction,
): Record<string, unknown> | null {
  const data = interaction.options.data;
  if (data.length === 0) return null;
  const result: Record<string, unknown> = {};
  for (const opt of data) {
    if ("value" in opt && opt.value != null) {
      result[opt.name] = opt.value;
    } else if ("options" in opt && opt.options) {
      for (const sub of opt.options) {
        if ("value" in sub && sub.value != null) {
          result[`${opt.name}.${sub.name}`] = sub.value;
        }
      }
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

function baseEntry(
  interaction: ChatInputCommandInteraction | AutocompleteInteraction | ButtonInteraction,
  kind: InteractionKind,
  commandName: string,
): Omit<AuditEntry, "success" | "errorMessage" | "durationMs"> {
  return {
    executedAt: Date.now(),
    interactionType: kind,
    commandName,
    discordUserId: interaction.user.id,
    discordUsername: interaction.user.username,
    guildId: interaction.guildId,
    guildName: interaction.guild?.name ?? null,
    channelId: interaction.channelId,
    optionsJson:
      kind === "button"
        ? { customId: (interaction as ButtonInteraction).customId }
        : extractSlashOptions(interaction as ChatInputCommandInteraction | AutocompleteInteraction),
  };
}

export function recordCommandAudit(
  interaction: ChatInputCommandInteraction,
  success: boolean,
  durationMs: number,
  errorMessage: string | null = null,
): void {
  insertAudit({
    ...baseEntry(interaction, "slash", interaction.commandName),
    success,
    errorMessage,
    durationMs,
  });
}

export function recordAutocompleteAudit(
  interaction: AutocompleteInteraction,
  success: boolean,
  durationMs: number,
  errorMessage: string | null = null,
): void {
  insertAudit({
    ...baseEntry(interaction, "autocomplete", interaction.commandName),
    success,
    errorMessage,
    durationMs,
  });
}

export function recordButtonAudit(
  interaction: ButtonInteraction,
  success: boolean,
  durationMs: number,
  errorMessage: string | null = null,
): void {
  const customId = interaction.customId;
  const commandName = customId.startsWith("bw:mode:")
    ? "button:bedwars-mode"
    : customId.startsWith("lb:")
      ? "button:leaderboard"
      : customId.startsWith("glb:")
        ? "button:globallb"
        : `button:${customId.split(":")[0] ?? customId}`;
  insertAudit({
    ...baseEntry(interaction, "button", commandName),
    success,
    errorMessage,
    durationMs,
  });
}

export function auditEntryForSync(entry: AuditEntry & { id: number }) {
  return {
    id: entry.id,
    executedAt: Math.floor(entry.executedAt / 1000),
    interactionType: entry.interactionType,
    commandName: entry.commandName,
    discordUserId: entry.discordUserId,
    discordUsername: entry.discordUsername,
    guildId: entry.guildId,
    guildName: entry.guildName,
    channelId: entry.channelId,
    optionsJson: entry.optionsJson,
    success: entry.success,
    errorMessage: entry.errorMessage,
    durationMs: entry.durationMs,
  };
}
