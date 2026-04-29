import { REST, Routes } from "discord.js";
import { commands } from "./commands/index.ts";
import { env } from "./env.ts";
import { log } from "./log.ts";

/**
 * PUT the slash-command registry to Discord. Idempotent — Discord replaces
 * the entire command set atomically on each call, so it's safe to call this
 * on every boot. Reused by `src/index.ts` (auto-register) and the
 * `bun run register` CLI script.
 */
export async function registerSlashCommands(): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);
  const body = commands.map((command) => command.json);

  if (env.DISCORD_DEV_GUILD_ID) {
    await rest.put(
      Routes.applicationGuildCommands(env.DISCORD_APP_ID, env.DISCORD_DEV_GUILD_ID),
      { body },
    );
    log.info({ guildId: env.DISCORD_DEV_GUILD_ID, count: body.length }, "registered guild commands");
    return;
  }

  await rest.put(Routes.applicationCommands(env.DISCORD_APP_ID), { body });
  log.info({ count: body.length }, "registered global commands");
}

// CLI entry — `bun run register` still works the same.
if (import.meta.main) {
  await registerSlashCommands();
}
