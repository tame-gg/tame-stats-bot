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

export type AdminBadgeKey = "admin" | "mod" | "famous" | "verified" | "linked";

export type TrustTagKey =
  | "confirmed_cheater"
  | "blatant_cheater"
  | "closet_cheater"
  | "caution"
  | "sniper"
  | "legit_sniper"
  | "possible_sniper"
  | "info"
  | "account";

export type TrustSource = "urchin" | "seraph";

export type TrustSourceStatus = "ok" | "disabled" | "error" | "rate_limited";

export type TrustSummary = "clean" | "caution" | "sniper" | "cheater" | "confirmed";

export type TrustTag = {
  key: TrustTagKey;
  label: string;
  glyph: string;
  severity: number;
  source: TrustSource;
  sources?: TrustSource[];
  reason?: string;
  verified?: boolean;
  addedAt?: number;
  addedBy?: string;
  tone: "danger" | "warn" | "neutral" | "ok";
};

export type PlayerTrustStatus = {
  summary: TrustSummary;
  tags: TrustTag[];
  safelisted: boolean;
  fetchedAt: number;
  sources: {
    seraph: { status: TrustSourceStatus; error?: string };
    urchin: { status: TrustSourceStatus; error?: string };
  };
};

export type BedwarsCardMeta = {
  star: number;
  starFloor: number;
  starNext: number;
  starColor: string;
  expCurrent: number;
  expRequired: number;
  tokens: number | null;
  iron: number | null;
  gold: number | null;
  diamonds: number | null;
  emeralds: number | null;
  slumberTickets: number | null;
  slumberTotal: number | null;
};

export type PlayerPreview = {
  uuid: string;
  ign: string;
  rank: HypixelRank;
  networkLevel: number | null;
  lastSnapshotAt: number | null;
  games: PreviewGame[];
  /** Admin-curated flair badges. `linked` is auto-promoted when discord_links exists. */
  adminBadges: AdminBadgeKey[];
  /** Most-recently-linked Discord username (no @-prefix). */
  discordUsername: string | null;
  /** Community blacklist tags (Urchin + Seraph), when the feature is on. */
  trust: PlayerTrustStatus | null;
  /** Bedwars star progress + resource totals for stat cards. */
  bedwars?: BedwarsCardMeta | null;
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
  adminBadges: AdminBadgeKey[];
};

export type GlobalLeaderboardRow = {
  uuid: string;
  ign: string;
  value: number;
  secondary?: number | null;
  rank?: number;
};

export type GlobalLeaderboardPage = {
  rows: GlobalLeaderboardRow[];
  total: number;
  hasMore: boolean;
  nextCursor?: string | null;
  approxTotal?: number;
};

export type TrackedRosterPlayer = {
  uuid: string;
  ign: string;
  rank: HypixelRank;
  networkLevel: number | null;
  lastSnapshotAt: number | null;
  modes: number;
  topModes: string[];
  daysTracked: number;
  snapshots: number;
  adminBadges: AdminBadgeKey[];
};

export type TrackedRosterPage = {
  players: TrackedRosterPlayer[];
  total: number;
  hasMore: boolean;
};

export type TrendingPlayer = {
  uuid: string;
  ign: string;
  score: number;
  games: number;
  fkdrChange: number;
  starChange: number;
};

export type DenickerNickState =
  | "likely_nicked"
  | "uncertain"
  | "real_account"
  | "api_error"
  | "invalid_ign";

export type DenickerCheckResult = {
  ign: string;
  state: DenickerNickState;
  mojangUuid?: string;
  mojangIgn?: string;
  hypixelFound?: boolean;
  message: string;
  tips: string[];
};

export type RankIndexPlayer = {
  uuid: string;
  ign: string;
};

export type RankIndexGroup = {
  rank: HypixelRank;
  count: number;
  players: RankIndexPlayer[];
};

export type RankIndex = {
  groups: RankIndexGroup[];
  totalPlayers: number;
  totalRanks: number;
};

/**
 * A rank breakdown the bot computes itself by paging the public tracked-roster
 * endpoint, used as a graceful fallback when tame.gg hasn't shipped the
 * server-side `/api/bot/ranks` (DB-backed `getRankIndex()`) yet. It's a live
 * *sample* of the roster — honest about not being the full index.
 */
export type DerivedRankIndex = {
  groups: RankIndexGroup[];
  /** Players examined across the pages we fetched. */
  sampled: number;
  /** Of those, how many had a snapshot (so their rank is real, not defaulted). */
  counted: number;
  /** Total tracked players reported by the roster endpoint. */
  rosterTotal: number;
  totalRanks: number;
};

export type SiteAnnouncement = {
  text: string;
};

export type TickerItem = {
  id: string;
  text: string;
};

export type SiteTicker = {
  items: TickerItem[];
};

export type RecentlyTrackedPlayer = {
  uuid: string;
  ign: string;
  /** Unix seconds. */
  addedAt: number;
};

export type GuildMember = {
  uuid: string;
  /** Populated when the member is in tame.gg/stats' tracked roster, else null. */
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
  /** How many members are tracked on tame.gg/stats. */
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

const statsBaseUrl = env.TAME_API_BASE.replace(/\/+$/, "");
const apiBaseUrl = statsBaseUrl.replace(/\/stats$/, "");
/** Origin header for tame.gg web APIs gated by `hasAllowedAppOrigin`. */
const appOrigin = new URL(apiBaseUrl).origin;

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
 * Fetch a JSON endpoint on tame.gg/api with a single 5xx retry, structured
 * timing logs, and a typed error surface so callers can distinguish "this
 * player just doesn't exist" (404) from "the bot is misconfigured" (401)
 * from "tame.gg/api is having a moment" (5xx / network).
 */
async function requestJson<T>(path: string, opts: RequestOpts): Promise<T> {
  const url = `${apiBaseUrl}${path}`;
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

/**
 * Fetch a JSON endpoint on tame.gg that requires a browser-style Origin
 * header (`/api/leaderboard`, `/api/tracked`, `/api/denicker/*`, …).
 */
async function requestAppJson<T>(path: string, opts: { timeoutMs?: number } = {}): Promise<T> {
  const url = `${apiBaseUrl}${path}`;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const startedAt = performance.now();
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", Origin: appOrigin },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const ms = Math.round(performance.now() - startedAt);
    log.info({ method: "GET", url: path, status: res.status, ms }, "tame app api call");

    if (res.status === 403) {
      throw new TameApiError("forbidden", `403 from ${path} — origin rejected`, 403);
    }
    if (res.status === 404) {
      throw new TameApiError("not_found", `404 from ${path}`, 404);
    }
    if (res.status === 429) {
      throw new TameApiError("client", `rate limited on ${path}`, 429);
    }
    if (!res.ok) {
      throw new TameApiError(
        res.status >= 500 ? "server" : "client",
        `HTTP ${res.status} from ${path}`,
        res.status,
      );
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof TameApiError) throw err;
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    throw new TameApiError(
      isTimeout ? "timeout" : "network",
      err instanceof Error ? err.message : String(err),
    );
  }
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
   * Mirror a successful /link to tame.gg/api's `discord_links` table so
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
    const url = `${apiBaseUrl}/api/bot/discord-link`;
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
    const url = `${apiBaseUrl}/api/bot/discord-link/${encodeURIComponent(discordUserId)}`;
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

  /** Full discord_links roster for cold-start resync from Postgres. */
  async listDiscordLinks(): Promise<
    Array<{
      discordUserId: string;
      discordUsername: string;
      uuid: string;
      ign: string;
      guildId: string | null;
      linkedAt: number;
    }>
  > {
    return requestJson("/api/bot/discord-links", { withBotAuth: true, timeoutMs: 15_000 });
  },

  /** Periodic telemetry for the tame.gg admin Discord bot dashboard. */
  async postHeartbeat(payload: Record<string, unknown>): Promise<void> {
    const url = `${apiBaseUrl}/api/bot/heartbeat`;
    const startedAt = performance.now();
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.TAME_BOT_TOKEN}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    const ms = Math.round(performance.now() - startedAt);
    log.info({ method: "POST", url: "/api/bot/heartbeat", status: res.status, ms }, "tame api call");
    if (!res.ok) {
      throw new TameApiError(
        res.status === 401 ? "unauthorized" : res.status >= 500 ? "server" : "client",
        `HTTP ${res.status} from /api/bot/heartbeat`,
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

  /** Site-wide announcement banner copy. Empty string means no banner. */
  async announcement(): Promise<SiteAnnouncement | null> {
    try {
      return await requestJson<SiteAnnouncement>(`/api/announcement`, { withBotAuth: false });
    } catch (err) {
      if (err instanceof TameApiError) {
        log.debug({ kind: err.kind }, "tame.announcement degraded");
        return null;
      }
      throw err;
    }
  },

  /** Recent activity marquee lines shown at the top of tame.gg pages. */
  async ticker(): Promise<SiteTicker | null> {
    try {
      return await requestJson<SiteTicker>(`/api/ticker`, { withBotAuth: false });
    } catch (err) {
      if (err instanceof TameApiError) {
        log.debug({ kind: err.kind }, "tame.ticker degraded");
        return null;
      }
      throw err;
    }
  },

  /**
   * Full global leaderboard page — mirrors `/stats/leaderboard` on the site.
   * Backed by `/api/leaderboard` (game, metric, sort, limit, offset).
   */
  async globalLeaderboard(opts: {
    game: string;
    metric: string;
    sort?: "asc" | "desc";
    limit?: number;
    offset?: number;
  }): Promise<GlobalLeaderboardPage> {
    const params = new URLSearchParams({
      game: opts.game,
      metric: opts.metric,
      sort: opts.sort ?? "desc",
      limit: String(Math.min(Math.max(opts.limit ?? 10, 1), 20)),
      offset: String(Math.max(opts.offset ?? 0, 0)),
    });
    return requestAppJson<GlobalLeaderboardPage>(`/api/leaderboard?${params.toString()}`);
  },

  /** Paginated tracked roster — mirrors `/stats/tracked`. */
  async trackedRoster(limit = 10, offset = 0): Promise<TrackedRosterPage> {
    const params = new URLSearchParams({
      limit: String(Math.min(Math.max(limit, 1), 16)),
      offset: String(Math.max(offset, 0)),
    });
    return requestAppJson<TrackedRosterPage>(`/api/tracked?${params.toString()}`);
  },

  /** Biggest movers over the last few days — public, no origin gate. */
  async trending(limit = 6): Promise<TrendingPlayer[]> {
    try {
      const body = await requestJson<{ trending: TrendingPlayer[] }>(`/api/trending`, {
        withBotAuth: false,
      });
      return (body.trending ?? []).slice(0, Math.min(Math.max(limit, 1), 25));
    } catch (err) {
      if (err instanceof TameApiError) {
        log.debug({ kind: err.kind }, "tame.trending degraded");
        return [];
      }
      throw err;
    }
  },

  /** Quick nick check — mirrors the Denicker "Check" tab on `/stats/denicker`. */
  async denickerCheck(ign: string): Promise<DenickerCheckResult | null> {
    const trimmed = ign.trim();
    if (!trimmed) return null;
    try {
      return await requestAppJson<DenickerCheckResult>(
        `/api/denicker/check?${new URLSearchParams({ ign: trimmed }).toString()}`,
      );
    } catch (err) {
      if (err instanceof TameApiError && err.kind === "not_found") return null;
      throw err;
    }
  },

  /**
   * Hypixel rank index across the tracked roster — mirrors `/stats/ranks`.
   * Requires `/api/bot/ranks` on tame.gg (not deployed yet); returns null on 404.
   */
  async ranks(limitGroups = 15): Promise<RankIndex | null> {
    const params = new URLSearchParams({ limit: String(Math.min(Math.max(limitGroups, 1), 25)) });
    try {
      return await requestJson<RankIndex>(`/api/bot/ranks?${params.toString()}`, {
        withBotAuth: true,
      });
    } catch (err) {
      if (err instanceof TameApiError && err.kind === "not_found") return null;
      throw err;
    }
  },

  /**
   * Best-effort rank breakdown derived client-side by paging the public
   * `/api/tracked` roster (each row already carries a parsed HypixelRank).
   * Used when `/api/bot/ranks` isn't deployed. We page until we've collected a
   * useful number of *snapshotted* players or hit a hard page cap, so a single
   * /ranks invocation stays fast and doesn't exhaust the roster rate-limit.
   * Players without a snapshot are skipped — their rank would default to
   * "None" and pollute the distribution.
   */
  async rankIndexFromRoster(
    opts: { minCounted?: number; maxPages?: number; pageSize?: number } = {},
  ): Promise<DerivedRankIndex> {
    const pageSize = Math.min(Math.max(opts.pageSize ?? 16, 1), 16);
    const minCounted = opts.minCounted ?? 120;
    const maxPages = Math.min(Math.max(opts.maxPages ?? 16, 1), 40);

    const groups = new Map<string, RankIndexGroup>();
    let sampled = 0;
    let counted = 0;
    let rosterTotal = 0;
    let offset = 0;

    for (let page = 0; page < maxPages; page += 1) {
      const result = await tame.trackedRoster(pageSize, offset);
      rosterTotal = result.total;
      if (result.players.length === 0) break;

      for (const player of result.players) {
        sampled += 1;
        // No snapshot → rank is a defaulted "None", not a real observation.
        if (player.lastSnapshotAt == null) continue;
        counted += 1;
        const key = `${player.rank.key}\0${player.rank.label}`;
        let group = groups.get(key);
        if (!group) {
          group = { rank: player.rank, count: 0, players: [] };
          groups.set(key, group);
        }
        group.count += 1;
        if (group.players.length < 5) group.players.push({ uuid: player.uuid, ign: player.ign });
      }

      offset += result.players.length;
      if (!result.hasMore) break;
      if (counted >= minCounted) break;
    }

    const sorted = Array.from(groups.values()).sort(
      (a, b) =>
        b.count - a.count ||
        a.rank.label.localeCompare(b.rank.label, undefined, { sensitivity: "base" }),
    );

    return { groups: sorted, sampled, counted, rosterTotal, totalRanks: sorted.length };
  },

  /** Build a URL on the configured tame.gg/stats base. `path` should start with `/`. */
  siteUrl(path: string): string {
    return `${statsBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  },

  ogPlayer(ign: string): string {
    return `${statsBaseUrl}/${encodeURIComponent(ign)}/opengraph-image`;
  },

  /** Per-game OG card at `/stats/<ign>/<game>/opengraph-image`. */
  ogGame(ign: string, gameId: string): string {
    return `${statsBaseUrl}/${encodeURIComponent(ign)}/${encodeURIComponent(gameId)}/opengraph-image`;
  },

  ogCompare(igns: readonly string[]): string {
    const params = new URLSearchParams({ igns: igns.join(",") });
    return `${apiBaseUrl}/api/og/compare?${params.toString()}`;
  },

  playerUrl(ign: string): string {
    return `${statsBaseUrl}/${encodeURIComponent(ign)}`;
  },

  liveUrl(ign: string): string {
    return `${statsBaseUrl}/${encodeURIComponent(ign)}/live`;
  },

  compareUrl(igns: readonly string[]): string {
    return `${statsBaseUrl}/compare/${igns.map((ign) => encodeURIComponent(ign)).join("/")}/`;
  },

  faviconUrl(): string {
    return `${apiBaseUrl}/icon`;
  },
};
