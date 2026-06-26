import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { fileURLToPath } from "node:url";
import type { AdminBadgeKey, BedwarsMode, PlayerPreview, PreviewMetric, RankSegment } from "../api/tame.ts";
import { formatNumber } from "../util.ts";

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
    /* fallback fonts */
  }
}

const SERIF = "InstrumentSerif";
const SERIF_ITALIC = "InstrumentSerifItalic";
const SANS = "DMSans";
const SANS_BOLD = "DMSansBold";
const DISPLAY = "Syne";
const DISPLAY_BOLD = "SyneBold";

const W = 1080;
const H = 820;
const PAD = 36;

const SKIN_X = PAD;
const SKIN_Y = 78;
const SKIN_W = 132;
const SKIN_H = 176;

const INFO_X = SKIN_X + SKIN_W + 24;
const MISC_X = 780;
const DIVIDER_Y = 318;
const GRID_TOP = 368;
const GRID_BOTTOM = H - 52;

const CELL_PAD_X = 14;
const CELL_PAD_Y = 12;
const LABEL_FONT_SIZE = 11;
const LABEL_VALUE_GAP = 10;
const VALUE_FONT_MAX = 34;
const VALUE_FONT_MIN = 18;

const TEXT = "#F2F2F2";
const TEXT_DIM = "rgba(242,242,242,0.62)";
const TEXT_FAINT = "rgba(242,242,242,0.40)";
const LINE = "rgba(255,255,255,0.08)";
const LINE_2 = "rgba(255,255,255,0.14)";
const PANEL = "rgba(255,255,255,0.04)";
const PANEL_BORDER = "rgba(255,255,255,0.10)";
const ACCENT = "#E8B84A";
const GREEN = "#5BD17E";
const RED = "#E3685F";
const GOLD = "#E8B84A";
const PROGRESS = "#55FFFF";
const VERIFIED = "#55FF55";

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

const MISC_ROWS: Array<{
  key: "tokens" | "iron" | "gold" | "diamonds" | "emeralds";
  label: string;
  color: string;
}> = [
  { key: "tokens", label: "Tokens", color: GREEN },
  { key: "iron", label: "Iron", color: TEXT_DIM },
  { key: "gold", label: "Gold", color: GOLD },
  { key: "diamonds", label: "Diamonds", color: PROGRESS },
  { key: "emeralds", label: "Emeralds", color: GREEN },
];

function cleanUuid(uuid: string): string {
  return uuid.replace(/-/g, "").toLowerCase();
}

function findMetric(metrics: readonly PreviewMetric[], key: string): PreviewMetric | undefined {
  return metrics.find((m) => m.key === key);
}

function fmtMetric(metric: PreviewMetric | undefined): string {
  if (!metric || metric.value === null) return "—";
  return formatNumber(metric.value, metric.digits);
}

function resolveBedwarsMeta(preview: PlayerPreview): PlayerPreview["bedwars"] {
  if (preview.bedwars) return preview.bedwars;

  const game = preview.games.find((g) => g.id === "bedwars");
  const starMetric = game?.metrics.find((m) => m.key === "star");
  if (!starMetric || starMetric.value === null) return null;

  const star = starMetric.value;
  const starFloor = Math.floor(star);
  return {
    star,
    starFloor,
    starNext: starFloor + 1,
    starColor: starColorForLevel(starFloor, ACCENT),
    expCurrent: 0,
    expRequired: 1,
    tokens: null,
    iron: null,
    gold: null,
    diamonds: null,
    emeralds: null,
    slumberTickets: null,
    slumberTotal: null,
  };
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
  if (key === "losses" || key === "finalDeaths" || key === "deaths" || key === "bedsLost") return "red";
  if (key === "wins" || key === "finalKills" || key === "kills" || key === "bedsBroken") return "green";
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

function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number): void {
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

function measureTracked(ctx: SKRSContext2D, text: string, spacing: number): number {
  let width = 0;
  for (const ch of text) width += ctx.measureText(ch).width + spacing;
  return Math.max(0, width - spacing);
}

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

function starColorForLevel(level: number, fallback: string): string {
  const prestige = Math.floor(Math.max(0, level) / 100) % 22;
  const colors = [
    "#AAAAAA", "#FFFFFF", "#FFAA00", "#00AA00", "#00AAAA", "#AA0000", "#AA00AA", "#5555FF",
    "#555555", "#FFFFFF", "#FF5555", "#FF55FF", "#55FF55", "#FFFFFF", "#FFFF55", "#55FFFF",
    "#FFAA00", "#FF5555", "#AA00AA", "#FFFFFF", "#55FF55", "#FF55FF",
  ];
  return colors[prestige] ?? fallback;
}

function drawBackground(ctx: SKRSContext2D): void {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#1a2332");
  bg.addColorStop(0.45, "#121820");
  bg.addColorStop(1, "#0a0d12");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(SKIN_X + 60, SKIN_Y + 90, 0, SKIN_X + 60, SKIN_Y + 90, 360);
  glow.addColorStop(0, "rgba(85,255,255,0.10)");
  glow.addColorStop(1, "rgba(85,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 360);
}

async function loadBodySkin(uuid: string) {
  const id = encodeURIComponent(uuid);
  const clean = cleanUuid(uuid);
  const urls = [
    `https://starlightskins.lunarclient.com/render/isometric/${clean}/bust?cameraWidth=280&cameraHeight=360`,
    `https://minotar.net/bust/${id}/120`,
  ];
  for (const url of urls) {
    try {
      return await loadImage(url);
    } catch {
      /* try next */
    }
  }
  return null;
}

async function drawBodySkin(ctx: SKRSContext2D, uuid: string): Promise<void> {
  const skin = await loadBodySkin(uuid);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  if (skin) {
    ctx.drawImage(skin, SKIN_X, SKIN_Y, SKIN_W, SKIN_H);
  } else {
    roundRect(ctx, SKIN_X, SKIN_Y, SKIN_W, SKIN_H, 14);
    ctx.fillStyle = PANEL;
    ctx.fill();
    ctx.strokeStyle = PANEL_BORDER;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

function drawRankTag(
  ctx: SKRSContext2D,
  segments: readonly RankSegment[],
  x: number,
  baseline: number,
): void {
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `20px ${SANS_BOLD}`;
  let cx = x;
  for (const seg of segments) {
    ctx.fillStyle = seg.color || TEXT;
    ctx.fillText(seg.text, cx, baseline);
    cx += ctx.measureText(seg.text).width;
  }
}

function drawVerifiedBadge(ctx: SKRSContext2D, x: number, y: number): void {
  ctx.beginPath();
  ctx.arc(x, y, 11, 0, Math.PI * 2);
  ctx.fillStyle = VERIFIED;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x - 4, y);
  ctx.lineTo(x - 1, y + 4);
  ctx.lineTo(x + 5, y - 4);
  ctx.stroke();
}

function drawStarLevelTag(
  ctx: SKRSContext2D,
  level: number,
  color: string,
  x: number,
  baseline: number,
): number {
  const open = `[${level}`;
  ctx.font = `22px ${SANS_BOLD}`;
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(open, x, baseline);
  let cx = x + ctx.measureText(open).width;
  drawStar(ctx, cx + 8, baseline - 6, 7, 3.2, color);
  ctx.fillText("]", cx + 16, baseline);
  return cx + 16 + ctx.measureText("]").width;
}

function drawStarLevelTagRight(
  ctx: SKRSContext2D,
  level: number,
  color: string,
  rightX: number,
  baseline: number,
): void {
  const close = "]";
  ctx.font = `22px ${SANS_BOLD}`;
  const closeW = ctx.measureText(close).width;
  const open = `[${level}`;
  const openW = ctx.measureText(open).width;
  const starW = 16;
  const totalW = openW + starW + closeW;
  drawStarLevelTag(ctx, level, color, rightX - totalW, baseline);
}

function drawExpProgress(
  ctx: SKRSContext2D,
  bw: NonNullable<PlayerPreview["bedwars"]>,
  x: number,
  y: number,
  maxW: number,
): void {
  const floorColor = bw.starColor;
  const nextColor = starColorForLevel(bw.starNext, floorColor);
  const ratio = Math.min(1, bw.expRequired > 0 ? bw.expCurrent / bw.expRequired : 0);

  ctx.fillStyle = TEXT_DIM;
  ctx.font = `14px ${SANS}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(
    `EXP Progress: ${formatNumber(bw.expCurrent, 0)} / ${formatNumber(bw.expRequired, 0)}`,
    x,
    y,
  );

  const barY = y + 18;
  const barH = 16;
  const labelW = 72;
  const barX = x + labelW;
  const barW = maxW - labelW * 2;

  drawStarLevelTag(ctx, bw.starFloor, floorColor, x, barY + 13);

  roundRect(ctx, barX, barY, barW, barH, 4);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fill();
  ctx.strokeStyle = LINE_2;
  ctx.lineWidth = 1;
  ctx.stroke();

  const blocks = 24;
  const gap = 2;
  const blockW = (barW - gap * (blocks - 1)) / blocks;
  const filledBlocks = Math.round(ratio * blocks);
  for (let i = 0; i < blocks; i++) {
    const bx = barX + i * (blockW + gap);
    roundRect(ctx, bx, barY + 2, blockW, barH - 4, 2);
    ctx.fillStyle = i < filledBlocks ? PROGRESS : "rgba(255,255,255,0.06)";
    ctx.fill();
  }

  drawStarLevelTagRight(ctx, bw.starNext, nextColor, barX + barW + labelW, barY + 13);
}

function drawMiscStats(ctx: SKRSContext2D, bw: NonNullable<PlayerPreview["bedwars"]>): void {
  const boxW = W - MISC_X - PAD;
  let y = SKIN_Y + 4;

  ctx.fillStyle = TEXT_FAINT;
  ctx.font = `11px ${DISPLAY}`;
  fillTextTracked(ctx, "MISC STATS", MISC_X, y, 1.6);
  y += 22;

  roundRect(ctx, MISC_X, y, boxW, 248, 12);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fill();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.stroke();

  y += 24;
  let rowsDrawn = 0;
  for (const row of MISC_ROWS) {
    const value = bw[row.key];
    if (value == null) continue;
    rowsDrawn++;
    ctx.beginPath();
    ctx.arc(MISC_X + 16, y - 4, 4, 0, Math.PI * 2);
    ctx.fillStyle = row.color;
    ctx.fill();
    ctx.fillStyle = TEXT_DIM;
    ctx.font = `13px ${SANS}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(row.label, MISC_X + 28, y);
    ctx.textAlign = "right";
    ctx.fillStyle = TEXT;
    ctx.font = `14px ${SANS_BOLD}`;
    ctx.fillText(formatNumber(value, 0), MISC_X + boxW - 16, y);
    y += 28;
  }

  if (bw.slumberTickets != null) {
    rowsDrawn++;
    ctx.fillStyle = PROGRESS;
    ctx.beginPath();
    ctx.arc(MISC_X + 16, y - 4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = TEXT_DIM;
    ctx.font = `13px ${SANS}`;
    ctx.textAlign = "left";
    ctx.fillText("Slumber Tickets", MISC_X + 28, y);
    ctx.textAlign = "right";
    ctx.fillStyle = TEXT;
    ctx.font = `14px ${SANS_BOLD}`;
    const ticketLabel =
      bw.slumberTotal != null
        ? `${formatNumber(bw.slumberTickets, 0)}/${formatNumber(bw.slumberTotal, 0)}`
        : formatNumber(bw.slumberTickets, 0);
    ctx.fillText(ticketLabel, MISC_X + boxW - 16, y);
    y += 28;
  } else if (bw.slumberTotal != null) {
    rowsDrawn++;
    ctx.fillStyle = "#FF55FF";
    ctx.beginPath();
    ctx.arc(MISC_X + 16, y - 4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = TEXT_DIM;
    ctx.font = `13px ${SANS}`;
    ctx.textAlign = "left";
    ctx.fillText("Total Slumber Tickets", MISC_X + 28, y);
    ctx.textAlign = "right";
    ctx.fillStyle = TEXT;
    ctx.font = `14px ${SANS_BOLD}`;
    ctx.fillText(formatNumber(bw.slumberTotal, 0), MISC_X + boxW - 16, y);
  }

  if (rowsDrawn === 0) {
    ctx.fillStyle = TEXT_FAINT;
    ctx.font = `13px ${SANS}`;
    ctx.textAlign = "left";
    ctx.fillText("No resource totals in snapshot.", MISC_X + 16, y);
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
  roundRect(ctx, x, y, w, h, 12);
  ctx.fillStyle = PANEL;
  ctx.fill();
  ctx.strokeStyle = PANEL_BORDER;
  ctx.lineWidth = 1;
  ctx.stroke();

  const innerW = w - CELL_PAD_X * 2;
  const labelY = y + CELL_PAD_Y;
  const valueBottom = y + h - CELL_PAD_Y;
  const valueAreaTop = labelY + LABEL_FONT_SIZE + LABEL_VALUE_GAP;
  const valueAreaHeight = Math.max(0, valueBottom - valueAreaTop);

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = TEXT_DIM;
  ctx.font = `${LABEL_FONT_SIZE}px ${DISPLAY}`;
  ctx.fillText(cell.label.toUpperCase(), x + w / 2, labelY);

  const maxValueSize = Math.min(VALUE_FONT_MAX, Math.floor(valueAreaHeight));
  const valueSize = fitFontSize(ctx, cell.value, SERIF, innerW, maxValueSize, VALUE_FONT_MIN);

  ctx.textBaseline = "bottom";
  ctx.fillStyle = toneColor(cell.tone);
  ctx.font = `${valueSize}px ${SERIF}`;
  ctx.fillText(cell.value, x + w / 2, valueBottom);
}

export async function renderBedwarsCard(
  preview: PlayerPreview,
  mode: BedwarsMode,
): Promise<Buffer> {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  drawBackground(ctx);

  const modeLabel = MODE_LABELS[mode];
  const { metrics, hasMode } = pickBedwarsMetrics(preview, mode);
  const bw = resolveBedwarsMeta(preview);

  ctx.fillStyle = ACCENT;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `14px ${DISPLAY}`;
  fillTextTracked(ctx, `HYPIXEL BEDWARS · ${modeLabel.toUpperCase()}`, PAD, 42, 2.5);

  await drawBodySkin(ctx, preview.uuid);

  const hasRank = preview.rank && preview.rank.key !== "NONE" && preview.rank.label !== "None";
  let headerY = 88;
  if (hasRank && preview.rank.segments.length > 0) {
    drawRankTag(ctx, preview.rank.segments, INFO_X, headerY);
    headerY += 28;
  } else if (hasRank) {
    ctx.fillStyle = preview.rank.primaryColor || ACCENT;
    ctx.font = `20px ${SANS_BOLD}`;
    ctx.fillText(`[${preview.rank.label}]`, INFO_X, headerY);
    headerY += 28;
  }

  const verified = preview.adminBadges.includes("verified" as AdminBadgeKey);
  const ignMaxW = MISC_X - INFO_X - (verified ? 36 : 0) - 12;
  const ignSize = fitFontSize(ctx, preview.ign, SERIF_ITALIC, ignMaxW, 48, 28);
  ctx.fillStyle = TEXT;
  ctx.font = `${ignSize}px ${SERIF_ITALIC}`;
  ctx.fillText(preview.ign, INFO_X, headerY + 6);
  if (verified) {
    const ignW = ctx.measureText(preview.ign).width;
    drawVerifiedBadge(ctx, INFO_X + ignW + 18, headerY - 2);
  }
  headerY += 34;

  if (bw) {
    ctx.fillStyle = TEXT_DIM;
    ctx.font = `15px ${SANS}`;
    ctx.fillText("Level:", INFO_X, headerY);
    const levelX = INFO_X + ctx.measureText("Level:").width + 10;
    drawStarLevelTag(ctx, bw.starFloor, bw.starColor, levelX, headerY);
    drawExpProgress(ctx, bw, INFO_X, headerY + 14, MISC_X - INFO_X - 20);
    drawMiscStats(ctx, bw);
  }

  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, DIVIDER_Y);
  ctx.lineTo(W - PAD, DIVIDER_Y);
  ctx.stroke();

  ctx.fillStyle = TEXT_FAINT;
  ctx.font = `12px ${DISPLAY}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`BEDWARS STATS (${modeLabel.toUpperCase()})`, PAD, DIVIDER_Y + 24);

  if (!hasMode) {
    ctx.fillStyle = TEXT_DIM;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `32px ${SERIF_ITALIC}`;
    ctx.fillText(`No ${modeLabel} games tracked yet.`, W / 2, (GRID_TOP + GRID_BOTTOM) / 2 + 12);
  } else {
    const GRID_GAP = 12;
    const GRID_ROWS = 4;
    const GRID_COLS = 3;
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

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "right";
  const tail = "/stats";
  ctx.fillStyle = TEXT_DIM;
  ctx.font = `24px ${SERIF}`;
  const tailW = ctx.measureText(tail).width;
  ctx.fillText(tail, W - PAD, H - 22);
  ctx.fillStyle = ACCENT;
  ctx.font = `italic 24px ${SERIF_ITALIC}`;
  ctx.fillText("tame.gg", W - PAD - tailW, H - 22);

  return canvas.toBuffer("image/png");
}
