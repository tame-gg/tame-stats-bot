import type { AdminBadgeKey, PlayerPreview, PlayerTrustStatus, TrustSummary } from "../api/tame.ts";

const ADMIN_BADGE_META: Record<AdminBadgeKey, { label: string; glyph: string }> = {
  admin: { label: "Admin", glyph: "✦" },
  mod: { label: "Mod", glyph: "⚔" },
  famous: { label: "Famous", glyph: "★" },
  verified: { label: "Verified", glyph: "✓" },
  linked: { label: "Linked", glyph: "⌬" },
};

function trustSummaryLabel(summary: TrustSummary, safelisted: boolean): string {
  if (safelisted && summary === "clean") return "Safelisted";
  switch (summary) {
    case "confirmed":
      return "Confirmed Cheater";
    case "cheater":
      return "Flagged — Cheater";
    case "sniper":
      return "Flagged — Sniper";
    case "caution":
      return "Caution";
    default:
      return "Clean";
  }
}

function trustIsVisible(trust: PlayerTrustStatus): boolean {
  if (trust.tags.length > 0 || trust.safelisted) return true;
  const bothErrored =
    trust.sources.seraph.status === "error" && trust.sources.urchin.status === "error";
  const rateLimited =
    trust.sources.seraph.status === "rate_limited" &&
    trust.sources.urchin.status === "rate_limited";
  return !(bothErrored || rateLimited);
}

/** Compact badge strip — `✦ Admin · ⚔ Mod`. */
export function formatAdminBadges(badges: readonly AdminBadgeKey[]): string | null {
  if (badges.length === 0) return null;
  return badges.map((key) => `${ADMIN_BADGE_META[key].glyph} ${ADMIN_BADGE_META[key].label}`).join(" · ");
}

/** Badge glyphs only — for fixed-width leaderboard rows. */
export function adminBadgeGlyphs(badges: readonly AdminBadgeKey[]): string {
  if (badges.length === 0) return "";
  return `${badges.map((key) => ADMIN_BADGE_META[key].glyph).join("")} `;
}

export function formatDiscordLink(username: string | null): string | null {
  if (!username) return null;
  return `Linked · @${username}`;
}

/** Community trust summary + top tags. Mirrors the website TrustCard headline. */
export function formatTrustLine(trust: PlayerTrustStatus | null): string | null {
  if (!trust || !trustIsVisible(trust)) return null;
  if (trust.tags.length === 0 && !trust.safelisted) return null;

  const headline = trustSummaryLabel(trust.summary, trust.safelisted);
  if (trust.tags.length === 0) return `◆ ${headline}`;

  const tags = trust.tags
    .slice(0, 3)
    .map((tag) => `${tag.glyph} ${tag.label}${tag.verified === false ? " (unverified)" : ""}`)
    .join(" · ");
  return `◆ ${headline}: ${tags}`;
}

/**
 * Append flair lines (badges, Discord link, trust) below the primary
 * description block. Keeps player-focused embeds aligned with tame.gg's
 * hero chips without crowding the OG image.
 */
export function appendFlairLines(description: string, preview: PlayerPreview): string {
  const lines: string[] = [];
  if (description) lines.push(description);
  const badges = formatAdminBadges(preview.adminBadges ?? []);
  const discord = formatDiscordLink(preview.discordUsername ?? null);
  const trust = formatTrustLine(preview.trust ?? null);

  if (badges) lines.push(`*${badges}*`);
  if (discord) lines.push(`*${discord}*`);
  if (trust) lines.push(`*${trust}*`);
  return lines.join("\n");
}
