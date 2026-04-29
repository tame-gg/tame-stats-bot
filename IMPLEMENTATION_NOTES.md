# Implementation Notes

## API client (`src/api/tame.ts`)

- Real endpoints only — the deterministic mock data the scaffold returned on
  404 / network failure has been removed now that `/api/bot/*` is live on the
  main app. There's no mock UUID fallback to keep around.
- `requestJson` differentiates 401 (auth misconfigured), 404 (player /
  resource missing), 4xx (caller bug), 5xx (transient — retried once), and
  network/timeout errors via the `TameApiError` class.
- 401 propagates out of every wrapper — the top-level `interactionCreate`
  handler in `src/index.ts` turns it into a "bot is misconfigured" message
  to the user, and the startup self-check makes it fail-fast.
- Per-call structured timing log: `{ method, url, status, ms }`.
- `tame.session()` returns a non-nullable `HypixelSession`; offline shows up
  as `{ online: false }`. The endpoint never 404s for a real UUID, so a
  not-found here is treated as offline rather than null.

## Startup self-check (`src/api/self-check.ts`)

- Hits `/api/bot/resolve/Notch` exactly once after `ready`.
- 401 → `process.exit(1)` with a fatal log line.
- Any other failure (4xx, 5xx, network) logs at `warn` and proceeds —
  commands degrade gracefully on transient outages.

## Poller (`src/poller/`)

- `state.ts` carries everything cross-tick: last-known sessions per UUID,
  per-watcher last-alert timestamps, DM failure trackers, backoff state,
  in-flight tick promise, and `lastTickAt` for the health endpoint.
- Tick scheduling uses `setTimeout` recursively (not `setInterval`) so the
  next interval can be adjusted by backoff after each tick.
- Backoff: `BAD_TICK_FAIL_RATIO = 0.5` of session calls failing in a tick
  doubles the next interval up to `MAX_INTERVAL_MS = 5min`. Resets on a
  clean tick.
- Alert dedup: `${uuid}:${userId}` → ms map; suppresses re-alerts within
  10 min. Prevents flap-loop spam (online → afk → online).
- DM cooldown: 3 consecutive DM send failures → 24h skip for that user.
  Watches are kept; we just stop trying to send DMs to them. Successful
  send clears the counter.
- Roster cap warnings at 500 distinct watched UUIDs; alert (error log)
  at 1000.
- Don't update `lastKnown` from a failed fetch — keeps the next successful
  fetch from creating a phantom offline-edge that triggers a false alert.

## Graceful shutdown (`src/index.ts`)

- 10s budget on SIGINT / SIGTERM. `stopPoller()` first (cancels the next
  scheduled tick), then `waitForInflightTick(remaining)` (waits up to the
  budget for the running tick to complete), then `stopHealthServer()`,
  then `client.destroy()`. Exits 0.

## Embeds (`src/embeds/`, `src/commands/`)

- Player embed: title `<ign> · ✦ <netLevel>`; sidebar accent mapped from
  `rank.key` to a curated palette (gold/aqua/green) — independent from
  the in-game prefix color so the sidebar stays readable. 6 inline metric
  fields (FKDR, WLR, ★ Star, Final Kills, Wins, Online state).
- Compare embed: `A vs B`, or `A, B vs C` for 3+ players (matches the OG
  generator's grammar). Optional FKDR text field for screen readers /
  clients that don't render the OG image.
- Watchlist: per-player inline fields (capped at 25 to match Discord's
  embed-field limit and the in-app watchlist cap). Concurrency cap 5 on
  session fetches via `mapLimit`.
- Leaderboard: 🥇🥈🥉 for the top 3, then `#04`, `#05`, …; metric value
  in inline-code monospace; explicit "need 2 linked players" fallback
  when fewer than two users have run `/link`.

## Slash UX

- `watch`, `unwatch`, `link` defer ephemerally so the 3s interaction window
  isn't a footgun on slow Mojang lookups.
- `removeWatch` returns the canonical IGN of the removed row (`RETURNING ign`)
  — `unwatch` echoes "Stopped watching **CanonicalCase**".
- `link` and `watch` already echo `resolved.ign` (Mojang-canonical case).
- `MessageFlags.Ephemeral` is used in newly-touched commands; older
  unchanged commands keep the deprecated `ephemeral: true` to avoid
  spreading the migration outside this PR's scope.

## Logging (`src/log.ts`)

- Pretty-print transport (`pino-pretty`) loaded outside production.
  `pino-pretty` is a devDependency; the Dockerfile sets
  `ENV NODE_ENV=production` so the production install (which omits
  devDeps) doesn't trip the transport.
- `base: null` strips pid/hostname (the original `base: undefined` did
  not actually do that — pino fell through to its defaults).

## Health server (`src/health.ts`)

- `Bun.serve` on `HEALTH_PORT` (default 3000, set to 0 to disable).
- `GET /health` returns `{ ok, uptime, pollerLastTick }`. `pollerLastTick`
  is 0 until the first tick completes, which is normal during cold start.

## Database (`src/db.ts`)

- `removeWatch` now uses `RETURNING ign` to surface the canonical IGN.
- The bot-side SQLite migration is otherwise unchanged from the scaffold.
