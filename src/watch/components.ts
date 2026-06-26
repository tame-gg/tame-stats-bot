import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";

export function buildWatchAlertRow(ign: string, uuid: string, liveUrl: string, profileUrl: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setLabel("Update").setStyle(ButtonStyle.Secondary).setCustomId(`watch:refresh:${uuid}`),
    new ButtonBuilder().setLabel("Live tracker").setStyle(ButtonStyle.Link).setURL(liveUrl),
    new ButtonBuilder().setLabel("Profile").setStyle(ButtonStyle.Link).setURL(profileUrl),
  );
}

export function buildWatchExpiryRow(uuid: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("Extend 24 hours")
      .setStyle(ButtonStyle.Primary)
      .setCustomId(`watch:extend:${uuid}`),
  );
}

export function buildWatchlistRefreshRow() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("Refresh watchlist")
      .setStyle(ButtonStyle.Secondary)
      .setCustomId("watch:refresh-list"),
  );
}

export function formatExpiryRemaining(expiresAt: number, now = Date.now()): string {
  const ms = expiresAt - now;
  if (ms <= 0) return "expired";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours >= 1) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}
