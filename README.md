# tame-stats-bot

Bun + discord.js companion for [stats.tame.gg](https://stats.tame.gg). Slash
commands hit the `/api/preview/*` and `/api/bot/*` endpoints on the main app;
a poller wakes once a minute and DMs watchers when their tracked players
come online.

## Setup

1. Install dependencies:
   ```sh
   bun install
   ```
2. Copy `.env.example` to `.env` and fill in `DISCORD_TOKEN`, `DISCORD_APP_ID`,
   and `TAME_BOT_TOKEN`. The token must match the `TAME_BOT_TOKEN` set on
   stats.tame.gg — generate with `openssl rand -base64 48`.
3. Register slash commands (one-shot, run after every command schema change):
   ```sh
   bun run register
   ```
   Set `DISCORD_DEV_GUILD_ID` for instant guild registration while developing.
   Leave it empty for global registration (~1h propagation).
4. Start the bot:
   ```sh
   bun run dev
   ```

## Scripts

- `bun run dev` — run with Bun watch mode + pretty logs.
- `bun run start` — run the bot as you'd run it in prod.
- `bun run register` — push slash command definitions to Discord.
- `bun run typecheck` — `tsc --noEmit`.

## Invite URL

Replace `<APP_ID>` with your Discord application ID:

```
https://discord.com/oauth2/authorize?client_id=<APP_ID>&permissions=380104798720&scope=bot+applications.commands
```

Permissions integer `380104798720` covers: Send Messages, Embed Links, Use
External Emojis, Read Message History, Use Slash Commands.

## Deploy

- The bot keeps state in SQLite (watches, links, guild config). Mount a volume
  at `/app/data` so the file survives container restarts. The included
  `docker-compose.yml` does this with a host bind mount.
- Cron-style restarts are safe — the poller picks back up on the next tick
  and the first tick repopulates baseline state silently.
- Run `bun run register` once after every command-schema change. It is **not**
  part of the default startup path — bringing up two pods doesn't double-register.
- The bot exposes `GET /health` on `HEALTH_PORT` (default 3000). Returns
  `{ ok, uptime, pollerLastTick }`. Wire this into Railway / Fly health
  checks. Set `HEALTH_PORT=0` to disable.
- Graceful shutdown: SIGTERM stops the poller, waits up to 10s for the
  in-flight tick to finish, closes the Discord client, and exits 0.

## Hardening notes

- **Auth check on startup.** First thing after `ready` the bot hits
  `/api/bot/resolve/Notch`. A 401 means the shared token doesn't match —
  the bot exits 1 rather than running silently broken.
- **Poller backoff.** If more than half the session calls in a tick fail,
  the next interval doubles (capped at 5 min). Resets on a clean tick.
- **Alert dedup.** A given watcher won't get a re-alert for the same UUID
  within 10 min, even if the player flickers offline → online.
- **DM cooldown.** Three consecutive DM failures puts the user on a 24h
  cooldown (their watches are kept; we just stop trying to send).
- **Roster cap.** Logs a warning at 500 distinct watched UUIDs and an alert
  at 1000.

## API notes

`TAME_API_BASE` defaults to `https://stats.tame.gg`. Routes:

| Endpoint                           | Auth        | Purpose                              |
| ---------------------------------- | ----------- | ------------------------------------ |
| `GET /api/preview/{uuid}`          | public      | Tracked-player preview blob          |
| `GET /api/bot/resolve/{ign}`       | bot bearer  | Mojang IGN → UUID                    |
| `GET /api/bot/session/{uuid}`      | bot bearer  | Hypixel `/v2/status` (cached 30s)    |
| `GET /api/bot/search?q=&limit=`    | bot bearer  | Tracked-roster prefix search         |
| `GET /{ign}/opengraph-image`       | public      | OG image used in `/stats` embeds     |
| `GET /api/og/compare?igns=a,b`     | public      | OG image used in `/compare` embeds   |

## Slash commands

| Command                              | What it shows                                              |
| ------------------------------------ | ---------------------------------------------------------- |
| `/stats <ign>`                       | Headline (Bedwars-flavoured) embed + OG card               |
| `/hypixel <ign>`                     | Network overview — rank, level, games-tracked count        |
| `/bedwars <ign>`                     | Bedwars detail (FKDR, WLR, ★, finals, wins, beds)          |
| `/skywars <ign>`                     | Skywars detail (KDR, WLR, kills, wins, ★)                  |
| `/duels <ign>`                       | Duels detail (KDR, WLR, current/best winstreak, wins)      |
| `/murdermystery <ign>`               | Murder Mystery detail (kills, games, role wins)            |
| `/buildbattle <ign>`                 | Build Battle detail (games, correct guesses, votes)        |
| `/compare <ign1> <ign2> [ign3] [ign4]` | OG compare image + per-player Bedwars FKDR row           |
| `/watch <ign>`                       | Add to your watchlist (DM/channel alert when they log on)  |
| `/unwatch <ign>`                     | Remove from your watchlist                                 |
| `/watchlist`                         | Your watched players + current online state (ephemeral)    |
| `/link <ign>`                        | Link your Discord account to an IGN                        |
| `/unlink`                            | Clear your link                                            |
| `/leaderboard [game] [metric]`       | Rank linked Discord users in this server                   |
