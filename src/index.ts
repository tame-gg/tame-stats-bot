import { Client, GatewayIntentBits, MessageFlags } from "discord.js";
import { runStartupSelfCheck } from "./api/self-check.ts";
import { TameApiError } from "./api/tame.ts";
import { dispatchAutocomplete, dispatchCommand } from "./commands/index.ts";
import { migrate } from "./db.ts";
import { env } from "./env.ts";
import { startHealthServer, stopHealthServer } from "./health.ts";
import { log } from "./log.ts";
import { startPoller, stopPoller, waitForInflightTick } from "./poller/index.ts";

migrate();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once("ready", async (readyClient) => {
  log.info({ user: readyClient.user.tag }, "Discord client ready");
  await runStartupSelfCheck();
  startPoller(readyClient);
});

client.on("interactionCreate", (interaction) => {
  if (interaction.isAutocomplete()) {
    void dispatchAutocomplete(interaction).catch((err) => {
      log.error({ err, commandName: interaction.commandName }, "autocomplete failed");
    });
    return;
  }

  if (interaction.isChatInputCommand()) {
    const startedAt = performance.now();
    void dispatchCommand(interaction)
      .then(() => {
        log.info(
          {
            command: interaction.commandName,
            userId: interaction.user.id,
            guildId: interaction.guildId,
            durationMs: Math.round(performance.now() - startedAt),
          },
          "command ok",
        );
      })
      .catch(async (err) => {
        log.error(
          {
            err,
            command: interaction.commandName,
            userId: interaction.user.id,
            guildId: interaction.guildId,
            durationMs: Math.round(performance.now() - startedAt),
          },
          "command failed",
        );
        const message = humanizeCommandError(err);
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: message }).catch(() => null);
        } else {
          await interaction
            .reply({ content: message, flags: MessageFlags.Ephemeral })
            .catch(() => null);
        }
      });
  }
});

function humanizeCommandError(err: unknown): string {
  if (err instanceof TameApiError) {
    if (err.kind === "unauthorized") {
      return "Bot is not properly configured — contact the bot owner. (TAME_BOT_TOKEN mismatch)";
    }
    if (err.kind === "timeout" || err.kind === "network") {
      return "stats.tame.gg looks unreachable right now. Try again in a moment.";
    }
    if (err.kind === "server") {
      return "stats.tame.gg returned an error. Try again in a moment.";
    }
  }
  return "Something went wrong while running that command.";
}

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal }, "shutting down");

  // 10s budget for the whole shutdown — Railway / Docker will SIGKILL after,
  // so anything taking longer is going to be cut off either way.
  const deadline = Date.now() + 10_000;

  stopPoller();
  await waitForInflightTick(Math.max(0, deadline - Date.now())).catch((err) =>
    log.warn({ err }, "in-flight tick did not finish in time"),
  );

  stopHealthServer();
  await client.destroy().catch((err) => log.warn({ err }, "client.destroy failed"));

  log.info("shutdown complete");
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

startHealthServer();

await client.login(env.DISCORD_TOKEN);
