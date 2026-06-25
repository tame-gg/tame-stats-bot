import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import type { BedwarsMode, PlayerPreview, PreviewMetric } from "../api/tame.ts";
import { formatNumber } from "../util.ts";

const W = 1000;
const H = 560;

const BG = "#0A0A0A";
const PANEL = "rgba(255,255,255,0.04)";
const PANEL_BORDER = "rgba(255,255,255,0.10)";
const TEXT = "#F2F2F2";
const MUTED = "rgba(242,242,242,0.55)";
const ACCENT = "#E8B84A";
const GREEN = "#6CCB5F";
const RED = "#E85A5A";
const GOLD = "#E8B84A";

const MODE_LABELS: Record<BedwarsMode, string> = {
  overall: "Overall",
  solo: "Solo",
  doubles: "Doubles",
  trios: "Trios",
  fours: "Fours",
  dreams: "Dreams",
};

type GridCell = { label: string; value: string; tone: "green" | "red" | "gold" | "neutral" };

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

function cellTone(key: string): GridCell["tone"] {
  if (key === "wlr" || key === "fkdr" || key === "kdr" || key === "bblr") return "gold";
  if (key === "losses" || key === "finalDeaths" || key === "deaths" || key === "bedsLost") {
    return "red";
  }
  if (key === "wins" || key === "finalKills" || key === "kills" || key === "bedsBroken") {
    return "green";
  }
  return "neutral";
}

function toneColor(tone: GridCell["tone"]): string {
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
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawStatCell(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, cell: GridCell): void {
  roundRect(ctx, x, y, w, h, 12);
  ctx.fillStyle = PANEL;
  ctx.fill();
  ctx.strokeStyle = PANEL_BORDER;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = MUTED;
  ctx.font = "600 13px system-ui, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(cell.label.toUpperCase(), x + w / 2, y + 28);

  ctx.fillStyle = toneColor(cell.tone);
  ctx.font = "700 42px system-ui, Segoe UI, sans-serif";
  ctx.fillText(cell.value, x + w / 2, y + h - 22);
}

/**
 * Render a Bedwars stats card as PNG bytes. Mode-aware — tame.gg's OG route
 * only covers overall Bedwars, so the bot generates these locally for the
 * mode selector while keeping the same dark tame.gg palette.
 */
export async function renderBedwarsCard(
  preview: PlayerPreview,
  mode: BedwarsMode,
): Promise<Buffer> {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  const modeLabel = MODE_LABELS[mode];
  const rankPrefix = preview.rank?.label ? `[${preview.rank.label}] ` : "";

  // Header eyebrow
  ctx.fillStyle = ACCENT;
  ctx.font = "600 16px system-ui, Segoe UI, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`HYPIXEL BEDWARS · ${modeLabel.toUpperCase()}`, 40, 44);

  // Player head — best-effort; card still renders if mc-heads is slow.
  try {
    const head = await loadImage(`https://mc-heads.net/head/${encodeURIComponent(preview.uuid)}/128`);
    roundRect(ctx, 40, 68, 96, 96, 10);
    ctx.save();
    roundRect(ctx, 40, 68, 96, 96, 10);
    ctx.clip();
    ctx.drawImage(head, 40, 68, 96, 96);
    ctx.restore();
    ctx.strokeStyle = PANEL_BORDER;
    ctx.lineWidth = 1;
    roundRect(ctx, 40, 68, 96, 96, 10);
    ctx.stroke();
  } catch {
    roundRect(ctx, 40, 68, 96, 96, 10);
    ctx.fillStyle = PANEL;
    ctx.fill();
  }

  // Username + star
  ctx.fillStyle = TEXT;
  ctx.font = "700 44px system-ui, Segoe UI, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`${rankPrefix}${preview.ign}`, 156, 108);

  const { metrics, hasMode } = pickBedwarsMetrics(preview, mode);
  const star = findMetric(metrics, "star");
  if (star && star.value !== null) {
    ctx.fillStyle = ACCENT;
    ctx.font = "600 22px system-ui, Segoe UI, sans-serif";
    ctx.fillText(`★ ${formatNumber(star.value, 0)}`, 156, 142);
  }

  if (!hasMode) {
    ctx.fillStyle = MUTED;
    ctx.font = "500 24px system-ui, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`No ${modeLabel} games tracked.`, W / 2, H / 2 + 20);
  } else {
    const gridTop = 190;
    const padX = 40;
    const gap = 12;
    const cols = 3;
    const rows = 4;
    const cellW = (W - padX * 2 - gap * (cols - 1)) / cols;
    const cellH = (H - gridTop - 56 - gap * (rows - 1)) / rows;

    for (let row = 0; row < rows; row++) {
      const keys = BEDWARS_GRID[row]!;
      for (let col = 0; col < cols; col++) {
        const key = keys[col]!;
        const metric = findMetric(metrics, key);
        const cell: GridCell = {
          label: METRIC_LABELS[key] ?? key,
          value: fmtMetric(metric),
          tone: cellTone(key),
        };
        const x = padX + col * (cellW + gap);
        const y = gridTop + row * (cellH + gap);
        drawStatCell(ctx, x, y, cellW, cellH, cell);
      }
    }
  }

  // Footer
  ctx.fillStyle = MUTED;
  ctx.font = "500 18px system-ui, Segoe UI, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("tame.gg/stats", W - 40, H - 24);

  return canvas.toBuffer("image/png");
}
