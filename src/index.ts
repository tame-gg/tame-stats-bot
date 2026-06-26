import { ActivityType, Client, GatewayIntentBits, MessageFlags } from "discord.js";
import { runStartupSelfCheck } from "./api/self-check.ts";
import { TameApiError } from "./api/tame.ts";
import { dispatchAutocomplete, dispatchCommand } from "./commands/index.ts";
import { migrate } from "./db.ts";
import {
  initTelemetryStore,
  recordAutocompleteAudit,
  recordButtonAudit,
  recordCommandAudit,
  telemetryCounters,
} from "./telemetry/index.ts";
import { registerSlashCommands } from "./deploy-commands.ts";
import { env } from "./env.ts";
import { startHealthServer, stopHealthServer } from "./health.ts";
import { dispatchButton } from "./interactions/buttons.ts";
import { log } from "./log.ts";
import { startHeartbeatReporter, stopHeartbeatReporter } from "./panel/heartbeat.ts";
import { startPoller, stopPoller, waitForInflightTick } from "./poller/index.ts";
import { syncLinksOnReady } from "./sync/links.ts";

migrate();
initTelemetryStore();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once("ready", async (readyClient) => {
  log.info({ user: readyClient.user.tag }, "Discord client ready");
  await runStartupSelfCheck();
  await readyClient.application?.fetch().catch((err) => {
    log.warn({ err }, "application.fetch failed");
  });
  await syncLinksOnReady(readyClient);
  readyClient.user.setPresence({
    status: "online",
    activities: [{ name: "Hypixel stats", type: ActivityType.Watching }],
  });
  if (env.AUTO_REGISTER_COMMANDS) {
    try {
      await registerSlashCommands();
    } catch (err) {
      log.error({ err }, "auto-register slash commands failed");
    }
  }
  startPoller(readyClient);
  startHeartbeatReporter(readyClient);
});

client.on("guildCreate", (guild) => {
  telemetryCounters.guildJoin();
  log.info({ guildId: guild.id, name: guild.name }, "guild joined");
});

client.on("guildDelete", (guild) => {
  telemetryCounters.guildLeave();
  log.info({ guildId: guild.id, name: guild.name }, "guild left");
});

client.on("interactionCreate", (interaction) => {
  if (interaction.isAutocomplete()) {
    const startedAt = performance.now();
    void dispatchAutocomplete(interaction)
      .then(() => {
        recordAutocompleteAudit(interaction, true, Math.round(performance.now() - startedAt));
      })
      .catch((err) => {
        recordAutocompleteAudit(
          interaction,
          false,
          Math.round(performance.now() - startedAt),
          err instanceof Error ? err.message : String(err),
        );
        log.error({ err, commandName: interaction.commandName }, "autocomplete failed");
      });
    return;
  }

  if (interaction.isChatInputCommand()) {
    const startedAt = performance.now();
    void dispatchCommand(interaction)
      .then(() => {
        const durationMs = Math.round(performance.now() - startedAt);
        recordCommandAudit(interaction, true, durationMs);
        log.info(
          {
            command: interaction.commandName,
            userId: interaction.user.id,
            guildId: interaction.guildId,
            durationMs,
          },
          "command ok",
        );
      })
      .catch(async (err) => {
        const durationMs = Math.round(performance.now() - startedAt);
        recordCommandAudit(
          interaction,
          false,
          durationMs,
          err instanceof Error ? err.message : String(err),
        );
        log.error(
          {
            err,
            command: interaction.commandName,
            userId: interaction.user.id,
            guildId: interaction.guildId,
            durationMs,
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
    return;
  }

  if (interaction.isButton()) {
    const startedAt = performance.now();
    void dispatchButton(interaction)
      .then(() => {
        const durationMs = Math.round(performance.now() - startedAt);
        recordButtonAudit(interaction, true, durationMs);
        log.info(
          {
            customId: interaction.customId,
            userId: interaction.user.id,
            guildId: interaction.guildId,
            durationMs,
          },
          "button ok",
        );
      })
      .catch(async (err) => {
        const durationMs = Math.round(performance.now() - startedAt);
        recordButtonAudit(
          interaction,
          false,
          durationMs,
          err instanceof Error ? err.message : String(err),
        );
        log.error(
          {
            err,
            customId: interaction.customId,
            userId: interaction.user.id,
            guildId: interaction.guildId,
            durationMs,
          },
          "button failed",
        );
        const message = humanizeCommandError(err);
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral }).catch(() => null);
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
    if (err.kind === "forbidden") {
      // 403s carry a server-supplied message (blacklist hits, etc.) — show
      // it verbatim so users see "This username is in the tracking blacklist!"
      // and not a generic error.
      return err.message;
    }
    if (err.kind === "timeout" || err.kind === "network") {
      return "tame.gg/api looks unreachable right now. Try again in a moment.";
    }
    if (err.kind === "server") {
      return "tame.gg/api returned an error. Try again in a moment.";
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
  stopHeartbeatReporter();
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
