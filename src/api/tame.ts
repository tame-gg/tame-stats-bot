import { env } from "../env.ts";
import { log } from "../log.ts";

export type RankSegment = {
  text: string;
  color: string;
};

export type HypixelRank = {
  key: string;
  label: string;
  primaryColor: string;
  segments: RankSegment[];
};

export type PreviewMetric = {
  key: string;
  label: string;
  digits: number;
  isRatio: boolean;
  value: number | null;
};

export type PreviewGame = {
  id: string;
  label: string;
  hasPlayed: boolean;
  metrics: PreviewMetric[];
};

export type PlayerPreview = {
  uuid: string;
  ign: string;
  rank: HypixelRank;
  networkLevel: number | null;
  lastSnapshotAt: number | null;
  games: PreviewGame[];
};

export type HypixelSession = {
  online: boolean;
  gameType?: string;
  mode?: string;
  map?: string;
};

export type ResolvedPlayer = {
  uuid: string;
  ign: string;
};

const baseUrl = env.TAME_API_BASE.replace(/\/+$/, "");

export class TameApiError extends Error {
  constructor(
    public kind: "unauthorized" | "not_found" | "client" | "server" | "network" | "timeout",
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "TameApiError";
  }
}

type RequestOpts = {
  /** Send `Authorization: Bearer ${TAME_BOT_TOKEN}`. Required for /api/bot/*. */
  withBotAuth: boolean;
  /** Request timeout in ms. Defaults to 10s. */
  timeoutMs?: number;
};

/**
 * Fetch a JSON endpoint on stats.tame.gg with a single 5xx retry, structured
 * timing logs, and a typed error surface so callers can distinguish "this
 * player just doesn't exist" (404) from "the bot is misconfigured" (401)
 * from "stats.tame.gg is having a moment" (5xx / network).
 */
async function requestJson<T>(path: string, opts: RequestOpts): Promise<T> {
  const url = `${baseUrl}${path}`;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const startedAt = performance.now();
    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (opts.withBotAuth) headers.Authorization = `Bearer ${env.TAME_BOT_TOKEN}`;

      const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
      const ms = Math.round(performance.now() - startedAt);
      log.info({ method: "GET", url: path, status: res.status, ms }, "tame api call");

      if (res.status === 401) {
        throw new TameApiError("unauthorized", `401 from ${path} — TAME_BOT_TOKEN mismatch`, 401);
      }
      if (res.status === 404) {
        throw new TameApiError("not_found", `404 from ${path}`, 404);
      }
      if (res.status >= 400 && res.status < 500) {
        throw new TameApiError("client", `HTTP ${res.status} from ${path}`, res.status);
      }
      if (res.status >= 500) {
        lastError = new TameApiError("server", `HTTP ${res.status} from ${path}`, res.status);
        if (attempt === 0) continue;
        throw lastError;
      }
      return (await res.json()) as T;
    } catch (err) {
      const ms = Math.round(performance.now() - startedAt);

      if (err instanceof TameApiError) {
        // Don't retry auth/404/4xx — only the 5xx branch loops.
        if (err.kind !== "server") throw err;
        lastError = err;
        if (attempt === 0) continue;
        throw err;
      }

      // AbortError, fetch failure, DNS, etc. — treat as network.
      const isTimeout = err instanceof Error && err.name === "TimeoutError";
      const wrapped = new TameApiError(
        isTimeout ? "timeout" : "network",
        err instanceof Error ? err.message : String(err),
      );
      log.warn({ method: "GET", url: path, ms, kind: wrapped.kind }, "tame api error");
      lastError = wrapped;
      if (attempt === 0) continue;
      throw wrapped;
    }
  }

  // Loop exits only via throw; this is just to keep TS happy.
  throw lastError ?? new TameApiError("network", "unreachable");
}

export const tame = {
  /**
   * Mojang-resolves an IGN to its canonical UUID + display-cased name.
   * Returns null if the player doesn't exist (404). Throws on auth failure
   * or transient errors so the caller can show a real error message.
   */
  async resolve(ign: string): Promise<ResolvedPlayer | null> {
    const clean = ign.trim();
    if (!clean) return null;
    try {
      return await requestJson<ResolvedPlayer>(
        `/api/bot/resolve/${encodeURIComponent(clean)}`,
        { withBotAuth: true },
      );
    } catch (err) {
      if (err instanceof TameApiError && err.kind === "not_found") return null;
      throw err;
    }
  },

  /**
   * Pulls the public preview blob for a tracked UUID. Public endpoint —
   * no bot auth header. Returns null when the UUID isn't tracked yet.
   */
  async preview(uuid: string): Promise<PlayerPreview | null> {
    try {
      return await requestJson<PlayerPreview>(
        `/api/preview/${encodeURIComponent(uuid)}`,
        { withBotAuth: false },
      );
    } catch (err) {
      if (err instanceof TameApiError && err.kind === "not_found") return null;
      throw err;
    }
  },

  /**
   * Current Hypixel session. The endpoint never returns 404 for an unknown
   * UUID — it returns `{ online: false }` — so a thrown `not_found` here is
   * treated as offline rather than null, to keep poller/embed code simple.
   */
  async session(uuid: string): Promise<HypixelSession> {
    try {
      return await requestJson<HypixelSession>(
        `/api/bot/session/${encodeURIComponent(uuid)}`,
        { withBotAuth: true },
      );
    } catch (err) {
      if (err instanceof TameApiError && err.kind === "not_found") return { online: false };
      throw err;
    }
  },

  /**
   * Prefix-search the tracked roster (NOT Mojang) for IGN autocomplete.
   * Returns [] on transient failure so autocomplete degrades gracefully
   * — Discord shows "no choices" instead of an error popup.
   */
  async search(q: string, limit = 10): Promise<ResolvedPlayer[]> {
    const query = q.trim();
    if (!query) return [];
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    try {
      return await requestJson<ResolvedPlayer[]>(
        `/api/bot/search?${params.toString()}`,
        { withBotAuth: true },
      );
    } catch (err) {
      // Re-throw 401 so the startup self-check can fail-fast; for everything
      // else, swallow — autocomplete shouldn't crash a slash command.
      if (err instanceof TameApiError && err.kind === "unauthorized") throw err;
      log.debug({ err, q: query }, "tame.search degraded");
      return [];
    }
  },

  ogPlayer(ign: string): string {
    return `${baseUrl}/${encodeURIComponent(ign)}/opengraph-image`;
  },

  ogCompare(igns: readonly string[]): string {
    const params = new URLSearchParams({ igns: igns.join(",") });
    return `${baseUrl}/api/og/compare?${params.toString()}`;
  },

  playerUrl(ign: string): string {
    return `${baseUrl}/${encodeURIComponent(ign)}`;
  },

  liveUrl(ign: string): string {
    return `${baseUrl}/${encodeURIComponent(ign)}/live`;
  },

  compareUrl(igns: readonly string[]): string {
    return `${baseUrl}/compare/${igns.map((ign) => encodeURIComponent(ign)).join("/")}/`;
  },

  faviconUrl(): string {
    return `${baseUrl}/icon`;
  },
};
