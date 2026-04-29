import type { ChatInputCommandInteraction } from "discord.js";
import { tame, type ResolvedPlayer } from "../api/tame.ts";
import { getLinkForUser } from "../db.ts";

export type ResolvedTarget =
  | { kind: "ok"; player: ResolvedPlayer; fromLink: boolean }
  | { kind: "error"; message: string };

/**
 * Pick the target player for a stats-style command. If the slash invocation
 * supplied an `ign`, Mojang-resolves it. If not, falls back to whatever
 * Minecraft account the caller has linked via /link. Otherwise returns an
 * error message that nudges the user toward linking.
 *
 * Used by /stats /hypixel /bedwars /skywars /duels /murdermystery
 * /buildbattle /live — anywhere "the user probably means themselves" is
 * a reasonable default.
 */
export async function resolveCommandTarget(
  interaction: ChatInputCommandInteraction,
  optionName = "ign",
): Promise<ResolvedTarget> {
  const ignInput = interaction.options.getString(optionName);
  if (ignInput) {
    const resolved = await tame.resolve(ignInput);
    if (!resolved) {
      return { kind: "error", message: `Couldn't find **${ignInput}** on Mojang.` };
    }
    return { kind: "ok", player: resolved, fromLink: false };
  }

  const link = getLinkForUser(interaction.user.id);
  if (!link) {
    return {
      kind: "error",
      message:
        `Provide an IGN, or link your account first.\n` +
        `**To link:** in Minecraft, run \`/socials\` and set your Discord to \`${interaction.user.username}\`. ` +
        `Then run \`/link <ign>\` here.`,
    };
  }
  return {
    kind: "ok",
    player: { uuid: link.uuid, ign: link.ign },
    fromLink: true,
  };
}
