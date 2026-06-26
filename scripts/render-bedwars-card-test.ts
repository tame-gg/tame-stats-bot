/**
 * Local visual smoke-test for the Bedwars stats card. Renders a realistic
 * sample (asianrizz, [MVP++], overall Bedwars) to `assets/bedwars-card-sample.png`
 * so the design can be eyeballed without spinning up the bot.
 *
 *   bun run scripts/render-bedwars-card-test.ts
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { PlayerPreview, PreviewMetric } from "../src/api/tame.ts";
import { renderBedwarsCard } from "../src/images/bedwars-card.ts";

function metric(
  key: string,
  label: string,
  value: number,
  digits: number,
  isRatio = false,
): PreviewMetric {
  return { key, label, digits, isRatio, value };
}

const bedwarsMetrics: PreviewMetric[] = [
  metric("star", "Star", 489, 0),
  metric("wins", "Wins", 2303, 0),
  metric("losses", "Losses", 1876, 0),
  metric("wlr", "WLR", 1.23, 2, true),
  metric("finalKills", "Final Kills", 12109, 0),
  metric("finalDeaths", "Final Deaths", 1896, 0),
  metric("fkdr", "FKDR", 6.39, 2, true),
  metric("kills", "Kills", 15125, 0),
  metric("deaths", "Deaths", 12753, 0),
  metric("kdr", "KDR", 1.19, 2, true),
  metric("bedsBroken", "Beds Broken", 6200, 0),
  metric("bedsLost", "Beds Lost", 2368, 0),
  metric("bblr", "BBLR", 2.62, 2, true),
];

const preview: PlayerPreview = {
  uuid: "853c80ef-3c37-49fd-aa49-938bfcadae7d",
  ign: "asianrizz",
  rank: {
    key: "MVP_PLUS_PLUS",
    label: "MVP++",
    primaryColor: "#FFAA00",
    segments: [
      { text: "MVP", color: "#FFAA00" },
      { text: "++", color: "#FF5555" },
    ],
  },
  networkLevel: 489,
  lastSnapshotAt: Date.now(),
  games: [
    {
      id: "bedwars",
      label: "Bedwars",
      hasPlayed: true,
      metrics: bedwarsMetrics,
      modes: {},
    },
  ],
  adminBadges: ["verified"],
  discordUsername: null,
  trust: null,
  bedwars: {
    star: 489,
    starFloor: 489,
    starNext: 490,
    starColor: "#FFAA00",
    expCurrent: 12500,
    expRequired: 487000,
    tokens: 2840000,
    iron: 912000,
    gold: 456000,
    diamonds: 89000,
    emeralds: 12000,
    slumberTickets: 3,
    slumberTotal: 10,
  },
};

const out = fileURLToPath(new URL("../assets/bedwars-card-sample.png", import.meta.url));
const buffer = await renderBedwarsCard(preview, "overall");
await writeFile(out, buffer);
console.log(`wrote ${buffer.length} bytes -> ${out}`);
