import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { fileURLToPath } from "node:url";
import type { BedwarsMode, PlayerPreview, PreviewMetric, RankSegment } from "../api/tame.ts";
import { formatNumber } from "../util.ts";

/**
 * Brand fonts mirrored from tame.gg's OG cards (`lib/og-fonts.ts`): Instrument
 * Serif for headline numbers + IGN, DM Sans for body, Syne for the all-caps
 * eyebrows/labels. Registered once at module load so the canvas renders the
 * same refined type the website ships — system-ui fallbacks looked generic and
 * varied per host. Each TTF is a single weight/style, so we alias them under
 * distinct family names and reference those directly instead of leaning on the
 * canvas's (flaky) weight/style matching.
 */
const FONT_DIR = fileURLToPath(new URL("../../assets/fonts/", import.meta.url));
const FONTS: ReadonlyArray<readonly [string, string]> = [
  ["InstrumentSerif-Regular.ttf", "InstrumentSerif"],
  ["InstrumentSerif-Italic.ttf", "InstrumentSerifItalic"],
  ["DMSans-Medium.ttf", "DMSans"],
  ["DMSans-Bold.ttf", "DMSansBold"],
  ["Syne-SemiBold.ttf", "Syne"],
  ["Syne-Bold.ttf", "SyneBold"],
] as const;

for (const [file, family] of FONTS) {
  try {
    GlobalFonts.registerFromPath(`${FONT_DIR}${file}`, family);
  } catch {
    // Best-effort: a missing font falls back to canvas defaults rather than
    // throwing at import time and taking the whole bot down.
  }
}

const SERIF = "InstrumentSerif";
const SERIF_ITALIC = "InstrumentSerifItalic";
const SANS = "DMSans";
const SANS_BOLD = "DMSansBold";
const DISPLAY = "Syne";
const DISPLAY_BOLD = "SyneBold";

const W = 1000;
const H = 660;
const PAD = 44;

// --- header geometry ---
const HEAD_X = PAD;
const HEAD_Y = 74;
const HEAD_SIZE = 110;
const CONTENT_X = HEAD_X + HEAD_SIZE + 28;
const DIVIDER_Y = 202;

// --- grid geometry ---
const GRID_TOP = 228;
const GRID_BOTTOM = H - 72;
const GRID_GAP = 14;
const GRID_ROWS = 4;
const GRID_COLS = 3;
const CELL_PAD = 18;
const LABEL_BASELINE = 30;
const VALUE_BOTTOM_PAD = 16;
const VALUE_FONT_MAX = 42;
const VALUE_FONT_MIN = 22;

// --- palette (tame.gg dark theme tokens) ---
const TEXT = "#F2F2F2";
const TEXT_DIM = "rgba(242,242,242,0.62)";
const TEXT_FAINT = "rgba(242,242,242,0.40)";
const LINE = "rgba(255,255,255,0.08)";
const LINE_2 = "rgba(255,255,255,0.14)";
const ACCENT = "#E8B84A";
const ACCENT_SOFT = "rgba(232,184,74,0.12)";
const ACCENT_BORDER = "rgba(232,184,74,0.40)";
const GREEN = "#5BD17E";
const RED = "#E3685F";
const GOLD = "#E8B84A";

const MODE_LABELS: Record<BedwarsMode, string> = {
  overall: "Overall",
  solo: "Solo",
  doubles: "Doubles",
  trios: "Trios",
  fours: "Fours",
  dreams: "Dreams",
};

type Tone = "green" | "red" | "gold" | "neutral";
type GridCell = { label: string; value: string; tone: Tone };

const BEDWARS_GRID: ReadonlyArray<readonly [string, string, string]> = [
  ["wins", "losses", "wlr"],
  ["finalKills", "finalDeaths", "fkdr"],
  ["kills", "deaths", "kdr"],
  ["bedsBroken", "bedsLost", "bblr"],
] as const;

const METRIC_LABELS: Record<string, string> = {
  wins: "Wins",
  losses: "Losses",
  wlr: "WLR",
  finalKills: "Final Kills",
  finalDeaths: "Final Deaths",
  fkdr: "FKDR",
  kills: "Kills",
  deaths: "Deaths",
  kdr: "KDR",
  bedsBroken: "Beds Broken",
  bedsLost: "Beds Lost",
  bblr: "BBLR",
};

function findMetric(metrics: readonly PreviewMetric[], key: string): PreviewMetric | undefined {
  return metrics.find((m) => m.key === key);
}

function fmtMetric(metric: PreviewMetric | undefined): string {
  if (!metric || metric.value === null) return "—";
  return formatNumber(metric.value, metric.digits);
}

function pickBedwarsMetrics(
  preview: PlayerPreview,
  mode: BedwarsMode,
): { metrics: readonly PreviewMetric[]; hasMode: boolean } {
  const game = preview.games.find((g) => g.id === "bedwars");
  if (!game) return { metrics: [], hasMode: false };
  if (mode === "overall") return { metrics: game.metrics, hasMode: true };
  const modeMetrics = game.modes?.[mode];
  if (!modeMetrics || modeMetrics.length === 0) return { metrics: [], hasMode: false };
  return { metrics: modeMetrics, hasMode: true };
}

function cellTone(key: string): Tone {
  if (key === "wlr" || key === "fkdr" || key === "kdr" || key === "bblr") return "gold";
  if (key === "losses" || key === "finalDeaths" || key === "deaths" || key === "bedsLost") {
    return "red";
  }
  if (key === "wins" || key === "finalKills" || key === "kills" || key === "bedsBroken") {
    return "green";
  }
  return "neutral";
}

function toneColor(tone: Tone): string {
  switch (tone) {
    case "green":
      return GREEN;
    case "red":
      return RED;
    case "gold":
      return GOLD;
    default:
      return TEXT;
  }
}

function roundRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/** Measure a string drawn with manual letter-spacing (for tracked eyebrows). */
function measureTracked(ctx: SKRSContext2D, text: string, spacing: number): number {
  let width = 0;
  for (const ch of text) width += ctx.measureText(ch).width + spacing;
  return Math.max(0, width - spacing);
}

/** Draw left-anchored text with manual letter-spacing. Assumes textAlign left. */
function fillTextTracked(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
): void {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
}

/** Filled 5-point star — bundled fonts don't carry a reliable ★ glyph. */
function drawStar(
  ctx: SKRSContext2D,
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  color: string,
): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function fitFontSize(
  ctx: SKRSContext2D,
  text: string,
  family: string,
  maxWidth: number,
  maxSize: number,
  minSize: number,
): number {
  for (let size = maxSize; size >= minSize; size -= 1) {
    ctx.font = `${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) return size;
  }
  return minSize;
}

function drawBackground(ctx: SKRSContext2D): void {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#141414");
  bg.addColorStop(0.5, "#0D0D0D");
  bg.addColorStop(1, "#0A0A0A");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Soft gold glow anchored behind the header — subtle brand warmth.
  const glow = ctx.createRadialGradient(PAD + 120, 90, 0, PAD + 120, 90, 520);
  glow.addColorStop(0, "rgba(232,184,74,0.10)");
  glow.addColorStop(1, "rgba(232,184,74,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 320);
}

async function drawHead(ctx: SKRSContext2D, uuid: string): Promise<void> {
  try {
    const head = await loadImage(`https://minotar.net/avatar/${encodeURIComponent(uuid)}/180`);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    roundRect(ctx, HEAD_X, HEAD_Y, HEAD_SIZE, HEAD_SIZE, 16);
    ctx.clip();
    ctx.drawImage(head, HEAD_X, HEAD_Y, HEAD_SIZE, HEAD_SIZE);
    ctx.restore();
  } catch {
    roundRect(ctx, HEAD_X, HEAD_Y, HEAD_SIZE, HEAD_SIZE, 16);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fill();
  }
  ctx.strokeStyle = LINE_2;
  ctx.lineWidth = 1.5;
  roundRect(ctx, HEAD_X, HEAD_Y, HEAD_SIZE, HEAD_SIZE, 16);
  ctx.stroke();
}

/** Star badge pill on the right of the header. Returns its left edge x. */
function drawStarBadge(ctx: SKRSContext2D, star: number | null): number {
  if (star === null) return W - PAD;
  const value = formatNumber(star, 0);
  const cy = HEAD_Y + HEAD_SIZE / 2;
  const pillH = 58;
  const iconR = 13;

  ctx.font = `30px ${DISPLAY_BOLD}`;
  const textW = ctx.measureText(value).width;
  const padX = 24;
  const iconGap = 11;
  const pillW = padX + iconR * 2 + iconGap + textW + padX;
  const pillX = W - PAD - pillW;
  const pillY = cy - pillH / 2;

  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fillStyle = ACCENT_SOFT;
  ctx.fill();
  ctx.strokeStyle = ACCENT_BORDER;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // A 5-point star's geometric center sits above its visual mass (the two lower
  // arms extend further down than the single top tip). Nudge the draw origin
  // down so the star's bounding box — not its centroid — centers on the pill,
  // putting it on the same line as the number.
  const starCy = cy + iconR * 0.095;
  drawStar(ctx, pillX + padX + iconR, starCy, iconR, iconR * 0.46, ACCENT);

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = ACCENT;
  ctx.font = `30px ${DISPLAY_BOLD}`;
  ctx.fillText(value, pillX + padX + iconR * 2 + iconGap, cy);

  return pillX;
}

/** Render the colored [rank] tag using the API's per-segment colors. */
function drawRankTag(
  ctx: SKRSContext2D,
  segments: readonly RankSegment[],
  _primaryColor: string,
  x: number,
  baseline: number,
): void {
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `22px ${SANS_BOLD}`;
  let cx = x;
  for (const seg of segments) {
    ctx.fillStyle = seg.color || TEXT;
    ctx.fillText(seg.text, cx, baseline);
    cx += ctx.measureText(seg.text).width;
  }
}

function drawStatCell(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  cell: GridCell,
): void {
  // Tile surface with a soft drop shadow for depth.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 5;
  const fill = ctx.createLinearGradient(x, y, x, y + h);
  fill.addColorStop(0, "rgba(255,255,255,0.055)");
  fill.addColorStop(1, "rgba(255,255,255,0.018)");
  roundRect(ctx, x, y, w, h, 14);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 14);
  ctx.stroke();

  const innerX = x + CELL_PAD;
  const innerW = w - CELL_PAD * 2;

  // Label — Syne, all-caps, tracked, muted.
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = TEXT_DIM;
  ctx.font = `12px ${DISPLAY}`;
  fillTextTracked(ctx, cell.label.toUpperCase(), innerX, y + LABEL_BASELINE, 1.4);

  // Value — Instrument Serif, large, tone-colored.
  const valueBaseline = y + h - VALUE_BOTTOM_PAD;
  const size = fitFontSize(ctx, cell.value, SERIF, innerW, VALUE_FONT_MAX, VALUE_FONT_MIN);
  ctx.fillStyle = toneColor(cell.tone);
  ctx.font = `${size}px ${SERIF}`;
  ctx.fillText(cell.value, innerX, valueBaseline);
}

/**
 * Render a Bedwars stats card as PNG bytes. Mode-aware — tame.gg's OG route
 * only covers overall Bedwars, so the bot generates these locally for the
 * mode selector while keeping the same dark, refined tame.gg brand language:
 * Instrument Serif headline numbers, Syne eyebrows, gold accent.
 */
export async function renderBedwarsCard(
  preview: PlayerPreview,
  mode: BedwarsMode,
): Promise<Buffer> {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  drawBackground(ctx);

  const modeLabel = MODE_LABELS[mode];
  const { metrics, hasMode } = pickBedwarsMetrics(preview, mode);

  // Eyebrow — Syne caps, gold, tracked.
  ctx.fillStyle = ACCENT;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `15px ${DISPLAY}`;
  fillTextTracked(ctx, `HYPIXEL BEDWARS · ${modeLabel.toUpperCase()}`, PAD, 50, 3);

  await drawHead(ctx, preview.uuid);

  const star = findMetric(metrics, "star");
  const starValue = star && star.value !== null ? star.value : null;
  const pillLeft = drawStarBadge(ctx, starValue);

  // Rank tag (colored) above the IGN.
  const hasRank = preview.rank && preview.rank.key !== "NONE" && preview.rank.label !== "None";
  if (hasRank && preview.rank.segments.length > 0) {
    drawRankTag(ctx, preview.rank.segments, preview.rank.primaryColor, CONTENT_X, 116);
  } else if (hasRank) {
    ctx.fillStyle = preview.rank.primaryColor || ACCENT;
    ctx.font = `22px ${SANS_BOLD}`;
    ctx.textAlign = "left";
    ctx.fillText(`[${preview.rank.label}]`, CONTENT_X, 116);
  }

  // IGN — Instrument Serif italic, large, fit to available width.
  const ignMaxW = pillLeft - 28 - CONTENT_X;
  const ignSize = fitFontSize(ctx, preview.ign, SERIF_ITALIC, ignMaxW, 60, 30);
  ctx.fillStyle = TEXT;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `${ignSize}px ${SERIF_ITALIC}`;
  ctx.fillText(preview.ign, CONTENT_X, 174);

  // Header divider with a short gold tick.
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, DIVIDER_Y);
  ctx.lineTo(W - PAD, DIVIDER_Y);
  ctx.stroke();
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, DIVIDER_Y);
  ctx.lineTo(PAD + 64, DIVIDER_Y);
  ctx.stroke();

  if (!hasMode) {
    ctx.fillStyle = TEXT_DIM;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `34px ${SERIF_ITALIC}`;
    ctx.fillText(`No ${modeLabel} games tracked yet.`, W / 2, (GRID_TOP + GRID_BOTTOM) / 2);
  } else {
    const cellW = (W - PAD * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
    const cellH = (GRID_BOTTOM - GRID_TOP - GRID_GAP * (GRID_ROWS - 1)) / GRID_ROWS;

    for (let row = 0; row < GRID_ROWS; row++) {
      const keys = BEDWARS_GRID[row]!;
      for (let col = 0; col < GRID_COLS; col++) {
        const key = keys[col]!;
        const metric = findMetric(metrics, key);
        const cell: GridCell = {
          label: METRIC_LABELS[key] ?? key,
          value: fmtMetric(metric),
          tone: cellTone(key),
        };
        const cx = PAD + col * (cellW + GRID_GAP);
        const cy = GRID_TOP + row * (cellH + GRID_GAP);
        drawStatCell(ctx, cx, cy, cellW, cellH, cell);
      }
    }
  }

  // Footer — tame.gg/stats brand mark, Instrument Serif like the OG cards.
  // `tame.gg` carries the gold brand accent; `/stats` trails in a dimmer tone.
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "right";
  const tail = "/stats";
  ctx.fillStyle = TEXT_DIM;
  ctx.font = `26px ${SERIF}`;
  const tailW = ctx.measureText(tail).width;
  ctx.fillText(tail, W - PAD, H - 26);
  ctx.fillStyle = ACCENT;
  ctx.font = `italic 26px ${SERIF_ITALIC}`;
  ctx.fillText("tame.gg", W - PAD - tailW, H - 26);

  // Footer-left: faint snapshot context to balance the brand mark.
  ctx.textAlign = "left";
  ctx.fillStyle = TEXT_FAINT;
  ctx.font = `13px ${DISPLAY}`;
  fillTextTracked(ctx, "BEDWARS STATS", PAD, H - 28, 2);

  return canvas.toBuffer("image/png");
}
