import type { APIEmbedField } from "discord.js";
import { tame } from "../api/tame.ts";

/**
 * Shared visual tokens for every embed the bot ships. Mirrors
 * `tame-stats/app/globals.css` so the bot reads as the same product as the
 * website — gold accent, ink default, single accent rule.
 *
 * Palette / tokens — keep these in sync with the website:
 *   accent (gold) #E8B84A · accent-2 (deep gold) #C99530
 *   ink (sidebar default) 0x1a1812 · text #F2F2F2
 *
 * Sidebar rules (in order):
 *   1. Default → INK (0x1a1812). Used by per-game embeds, compare, lists.
 *   2. Player-focused embeds (/stats, /hypixel, watcher DM) → GOLD or rank tier.
 *   3. Rank tier overrides on player-focused embeds when a rank exists.
 *
 * Inside the embed body the only "color" is markdown — bold, italic,
 * inline-code. Never per-metric coloring.
 */
export const THEME = {
  /** Embed sidebar default — deep ink, matches the cream-mode ink on the website. */
  sidebar: 0x1a1812,
  /** Warm gold accent. Reserved for embeds where the player IS the focus. */
  accent: 0xe8b84a,
  /** Hover/pressed companion to accent — only used on the website, mirrored here for completeness. */
  accentDeep: 0xc99530,

  /**
   * Curated rank-tier sidebar palette. Maps to Hypixel rank keys returned in
   * `PlayerPreview.rank.key`. Unranked / unknown → `null` so the caller falls
   * back to whatever sidebar the embed type calls for.
   */
  rankSidebar: {
    MVP_PLUS_PLUS: 0xe8b84a, // gold tier — same as accent
    MVP_PLUS: 0xe8b84a,
    MVP: 0x55ffff, // aqua
    VIP_PLUS: 0x6ccb5f, // green
    VIP: 0x6ccb5f,
  } as const satisfies Record<string, number>,
} as const;

/**
 * Resolve an embed sidebar color for a player-focused embed (`/stats`,
 * `/hypixel`, watcher DM). When a rank tier is recognized we use the curated
 * tier color; otherwise we use the warm gold accent — the player IS the
 * focus, so gold is the right call. Pass an explicit `fallback` to opt in to
 * the ink default instead (e.g. for compare/per-game embeds).
 */
export function rankSidebar(rankKey: string | undefined, fallback = THEME.accent): number {
  if (!rankKey) return fallback;
  const tier = (THEME.rankSidebar as Record<string, number | undefined>)[rankKey];
  return tier ?? fallback;
}

/**
 * Standard footer applied to every embed: `stats.tame.gg/<ign>` + favicon.
 * Pass `null` to omit the trailing slug (e.g. for /serverstatus, /leaderboard
 * where there's no per-player URL).
 */
export function themeFooter(slug: string | null): { text: string; iconURL: string } {
  return {
    text: slug ? `stats.tame.gg/${slug}` : "stats.tame.gg",
    iconURL: tame.faviconUrl(),
  };
}

/**
 * Standard author block. Renders as a small grey eyebrow above the title:
 * `tame.gg / <section>` (e.g. `tame.gg / bedwars`). The slash is part of
 * the eyebrow grammar — don't include it in `section`.
 */
export function themeAuthor(section: string): { name: string; iconURL: string; url: string } {
  return {
    name: `tame.gg / ${section}`,
    iconURL: tame.faviconUrl(),
    url: tame.siteUrl("/"),
  };
}

/**
 * 96px 3D iso-head URL via mc-heads.net, used as `setThumbnail()` on the
 * per-game embeds. UUID is preferred (canonical, doesn't break on rename)
 * but IGN works too — the service falls back automatically.
 *
 * `/head/<id>/96` instead of `/avatar/<id>/64`: the avatar endpoint
 * returned a tiny black-square placeholder in production for several
 * weeks (verified 4xx behaviour at the size 64), the head endpoint
 * returns a real 96×102 PNG.
 */
export function headUrl(uuid: string): string {
  return `https://mc-heads.net/head/${encodeURIComponent(uuid)}/96`;
}

/**
 * Build a single inline field with the eyebrow grammar the design expects:
 * the field NAME is the all-caps mono label (FKDR / WLR / WINS / …), the
 * field VALUE is the number, optionally wrapped in inline-code. Discord
 * already renders field names in a small grey-ish style so we don't need
 * extra markdown there.
 */
export function statField(name: string, value: string, opts: { code?: boolean } = {}): APIEmbedField {
  const formatted = opts.code ? `\`${value}\`` : value;
  return { name, value: formatted, inline: true };
}

/**
 * Thin separator field — Discord doesn't have a real `<hr>` so we abuse a
 * non-inline empty field to force a row break. Useful between the headline
 * 2-up and the secondary 3-up.
 *
 * Note: Discord fields require both name and value to be non-empty, so we
 * use `​` zero-width-space for both. The visual result is a row of
 * blank space that separates the two clusters of inline fields.
 */
export function ruleField(): APIEmbedField {
  return { name: "​", value: "​", inline: false };
}

/**
 * Render a fixed-width codeblock list — the canonical row format for
 * `/topplayers`, `/leaderboard`, `/recent`, `/watchlist`. Caller passes an
 * array of pre-formatted row strings; this just wraps them in a triple-tick
 * fence so Discord renders them as monospace with column alignment. The
 * empty-list case is handled by the caller (different copy each time).
 */
export function codeBlock(lines: readonly string[]): string {
  return ["```", ...lines, "```"].join("\n");
}

/**
 * Pad a string to `width` columns, right-aligned (numbers) or left-aligned
 * (text). Used to build the codeblock list rows so columns line up. Strips
 * nothing — caller is responsible for ensuring the input fits.
 */
export function padRight(value: string, width: number): string {
  if (value.length >= width) return value;
  return value + " ".repeat(width - value.length);
}

export function padLeft(value: string, width: number): string {
  if (value.length >= width) return value;
  return " ".repeat(width - value.length) + value;
}
