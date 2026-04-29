import { z } from "zod";

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_APP_ID: z.string().min(1),
  DISCORD_DEV_GUILD_ID: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional()),
  TAME_API_BASE: z.string().url().default("https://stats.tame.gg"),
  TAME_BOT_TOKEN: z.string().min(1),
  DATABASE_PATH: z.string().min(1).default("./data/bot.db"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  // Set to 0 to disable. Bun.serve binds to 0.0.0.0 by default.
  HEALTH_PORT: z
    .preprocess((v) => (v === "" || v === undefined ? 3000 : Number(v)), z.number().int().min(0).max(65535))
    .default(3000),
  // PUT slash commands to Discord on every boot. Default true so hosts that
  // don't let operators run one-shot scripts (Pterodactyl, etc.) just work.
  // Set to "0" or "false" to suppress.
  AUTO_REGISTER_COMMANDS: z
    .preprocess((v) => v === "0" || v === "false" ? false : true, z.boolean())
    .default(true)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
