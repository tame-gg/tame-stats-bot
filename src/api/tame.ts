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

/**
 * Canonical Bedwars mode ids surfaced by the website preview API. The
 * `overall` slot doesn't appear in `PreviewGame.modes` — it's the top-level
 * `metrics` array — but it's a convenient member of the union for the
 * /bedwars mode-selector to dispatch on.
 */
export type BedwarsMode = "overall" | "solo" | "doubles" | "trios" | "fours" | "dreams";

export type PreviewGame = {
  id: string;
  label: string;
  hasPlayed: boolean;
  metrics: PreviewMetric[];
  /**
   * Per-mode metric arrays keyed by canonical mode id. Same shape and order
   * as `metrics`. Currently only `bedwars` populates this. An empty array
   * (`metrics: []`) means the player has zero games in that mode.
   */
  modes?: Record<string, PreviewMetric[]>;
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

export type LeaderboardRow = {
  uuid: string;
  ign: string;
  rank: HypixelRank;
  level: number;
  star: number;
  wins: number;
  fkdr: number | null;
};

export type RecentlyTrackedPlayer = {
  uuid: string;
  ign: string;
  /** Unix seconds. */
  addedAt: number;
};

export type GuildMember = {
  uuid: string;
  /** Populated when the member is in stats.tame.gg's tracked roster, else null. */
  ign: string | null;
  rank: string | null;
  /** Unix seconds. */
  joined: number | null;
};

export type GuildSummary = {
  id: string;
  name: string;
  tag: string | null;
  tagColor: string | null;
  description: string | null;
  /** Unix seconds. */
  createdAt: number | null;
  exp: number;
  memberCount: number;
  /** How many members are tracked on stats.tame.gg. */
  trackedCount: number;
  preferredGames: string[];
  members: GuildMember[];
};

export type HypixelNetworkStatus = {
  online: boolean;
  players: number | null;
  max: number | null;
  version: string | null;
  fetchedAt: number;
};

const baseUrl = env.TAME_API_BASE.replace(/\/+$/, "");

export class TameApiError extends Error {
  constructor(
    public kind:
      | "unauthorized"
      | "forbidden"
      | "not_found"
      | "client"
      | "server"
      | "network"
      | "timeout",
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
  /** HTTP method. Defaults to GET. POST is used by the track endpoint. */
  method?: "GET" | "POST";
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

      const method = opts.method ?? "GET";
      const res = await fetch(url, { method, headers, signal: AbortSignal.timeout(timeoutMs) });
      const ms = Math.round(performance.now() - startedAt);
      log.info({ method, url: path, status: res.status, ms }, "tame api call");

      if (res.status === 401) {
        throw new TameApiError("unauthorized", `401 from ${path} — TAME_BOT_TOKEN mismatch`, 401);
      }
      if (res.status === 403) {
        // 403s carry a user-facing reason (e.g. blacklist) — pull the body's
        // `message` (or `error`) so we can surface it to the caller verbatim.
        let reason = `403 from ${path}`;
        try {
          const body = (await res.json()) as { message?: unknown; error?: unknown };
          if (typeof body.message === "string" && body.message.length > 0) reason = body.message;
          else if (typeof body.error === "string" && body.error.length > 0) reason = body.error;
        } catch {
          /* body wasn't JSON — keep the default reason */
        }
        throw new TameApiError("forbidden", reason, 403);
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
      log.warn({ method: opts.method ?? "GET", url: path, ms, kind: wrapped.kind }, "tame api error");
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
   * Enrolls an unknown player into the tracked roster + captures a fresh
   * snapshot + returns their preview, all in one server hop. Bigger timeout
   * than other endpoints because the server has to make two upstream calls
   * (Mojang + Hypixel) before responding.
   */
  async track(
    ign: string,
  ): Promise<{ uuid: string; ign: string; preview: PlayerPreview | null } | null> {
    const trimmed = ign.trim();
    if (!trimmed) return null;
    try {
      return await requestJson<{ uuid: string; ign: string; preview: PlayerPreview | null }>(
        `/api/bot/track/${encodeURIComponent(trimmed)}`,
        { withBotAuth: true, method: "POST", timeoutMs: 15_000 },
      );
    } catch (err) {
      if (err instanceof TameApiError && err.kind === "not_found") return null;
      throw err;
    }
  },

  /**
   * Try `preview()` first; if the UUID isn't in the tracked roster yet,
   * fall back to `track()` to enroll + snapshot, then use the preview that
   * comes back in that response. Single helper so each per-game command
   * doesn't have to repeat the dance.
   */
  async previewOrTrack(resolved: ResolvedPlayer): Promise<PlayerPreview | null> {
    const existing = await tame.preview(resolved.uuid);
    if (existing) return existing;
    const tracked = await tame.track(resolved.ign);
    return tracked?.preview ?? null;
  },

  /**
   * Mirror a successful /link to stats.tame.gg's `discord_links` table so
   * the website can render the Discord chip on the player profile and the
   * admin panel sees the latest roster. Best-effort — failures should log
   * but not block the local upsert (bot SQLite is the source of truth).
   */
  async pushDiscordLink(payload: {
    discordUserId: string;
    discordUsername: string;
    uuid: string;
    ign: string;
    guildId: string | null;
    /** Unix seconds. */
    linkedAt: number;
  }): Promise<void> {
    const url = `${baseUrl}/api/bot/discord-link`;
    const startedAt = performance.now();
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.TAME_BOT_TOKEN}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    });
    const ms = Math.round(performance.now() - startedAt);
    log.info({ method: "POST", url: "/api/bot/discord-link", status: res.status, ms }, "tame api call");
    if (!res.ok) {
      throw new TameApiError(
        res.status === 401 ? "unauthorized" : res.status >= 500 ? "server" : "client",
        `HTTP ${res.status} from /api/bot/discord-link`,
        res.status,
      );
    }
  },

  async removeDiscordLink(discordUserId: string): Promise<void> {
    const url = `${baseUrl}/api/bot/discord-link/${encodeURIComponent(discordUserId)}`;
    const startedAt = performance.now();
    const res = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${env.TAME_BOT_TOKEN}` },
      signal: AbortSignal.timeout(8_000),
    });
    const ms = Math.round(performance.now() - startedAt);
    log.info(
      { method: "DELETE", url: `/api/bot/discord-link/${discordUserId}`, status: res.status, ms },
      "tame api call",
    );
    if (!res.ok) {
      throw new TameApiError(
        res.status === 401 ? "unauthorized" : res.status >= 500 ? "server" : "client",
        `HTTP ${res.status} from /api/bot/discord-link/${discordUserId}`,
        res.status,
      );
    }
  },

  /**
   * Returns whatever Discord handle the player has set on their Hypixel
   * profile via in-game `/socials`. Used by the bot's /link verification
   * flow — never exposes the full social blob.
   */
  async socials(
    ign: string,
  ): Promise<{ uuid: string; ign: string; discord: string | null } | null> {
    const trimmed = ign.trim();
    if (!trimmed) return null;
    try {
      return await requestJson<{ uuid: string; ign: string; discord: string | null }>(
        `/api/bot/socials/${encodeURIComponent(trimmed)}`,
        { withBotAuth: true, timeoutMs: 12_000 },
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

  /**
   * Top-N global Bedwars leaderboard preview, ranked by star.
   */
  async leaderboard(limit = 10): Promise<LeaderboardRow[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    return requestJson<LeaderboardRow[]>(`/api/bot/leaderboard?${params.toString()}`, {
      withBotAuth: true,
    });
  },

  /**
   * Most-recently-added players in the tracked roster. Used by /recent.
   */
  async recent(limit = 10): Promise<RecentlyTrackedPlayer[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    return requestJson<RecentlyTrackedPlayer[]>(`/api/bot/recent?${params.toString()}`, {
      withBotAuth: true,
    });
  },

  /**
   * Guild lookup. `query` may be either a guild name or a player IGN — the
   * server smart-detects (player IGN tried first if the shape matches, falls
   * back to guild name). Returns null when neither match.
   */
  async guild(query: string): Promise<GuildSummary | null> {
    const trimmed = query.trim();
    if (!trimmed) return null;
    const params = new URLSearchParams({ q: trimmed });
    try {
      return await requestJson<GuildSummary>(`/api/bot/guild?${params.toString()}`, {
        withBotAuth: true,
        // Server may hop Mojang → Hypixel /v2/guild + a tracked_players query,
        // so leave the standard 10s default a bit loose.
        timeoutMs: 12_000,
      });
    } catch (err) {
      if (err instanceof TameApiError && err.kind === "not_found") return null;
      throw err;
    }
  },

  /**
   * Hypixel network status (player count, version) — public endpoint, no auth.
   */
  async hypixelStatus(): Promise<HypixelNetworkStatus | null> {
    try {
      return await requestJson<HypixelNetworkStatus>(`/api/hypixel-status`, {
        withBotAuth: false,
      });
    } catch (err) {
      if (err instanceof TameApiError) {
        log.debug({ kind: err.kind }, "tame.hypixelStatus degraded");
        return null;
      }
      throw err;
    }
  },

  /** Build a URL on the configured stats.tame.gg base. `path` should start with `/`. */
  siteUrl(path: string): string {
    return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
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
