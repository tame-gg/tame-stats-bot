import type { HypixelSession } from "../api/tame.ts";

const BASE_INTERVAL_MS = 60_000;
const MAX_INTERVAL_MS = 5 * 60_000;

/**
 * Per-tick rate at which `tame.session()` calls have been failing in a row.
 * On a successful tick we reset to 0; on a failing tick (>50% errors) we
 * double the interval up to `MAX_INTERVAL_MS`.
 */
export type Backoff = {
  intervalMs: number;
  /** Increment on bad ticks, reset on good ticks. */
  consecutiveBadTicks: number;
};

export type DmFailure = {
  count: number;
  /** ms epoch — DMs to this user are skipped until then. */
  lockedUntil: number;
};

export const pollerState = {
  firstTickComplete: false,
  /** Last seen Hypixel session per UUID — used to detect online edges. */
  lastKnown: new Map<string, HypixelSession>(),
  /** `${uuid}:${userId}` → last alert ms. Suppresses re-alerts within 10min. */
  lastAlertAt: new Map<string, number>(),
  /** userId → DM failure tracker. */
  dmFailures: new Map<string, DmFailure>(),
  backoff: { intervalMs: BASE_INTERVAL_MS, consecutiveBadTicks: 0 } as Backoff,
  /** Promise of the currently running tick (if any) — for graceful shutdown. */
  inFlightTick: null as Promise<void> | null,
  /** ms epoch of the last completed tick — exposed via /health. */
  lastTickAt: 0,
};

export const POLLER_CONSTANTS = {
  BASE_INTERVAL_MS,
  MAX_INTERVAL_MS,
  /** Suppress duplicate online alerts to the same watcher within this window. */
  ALERT_DEDUP_MS: 10 * 60_000,
  /** After this many consecutive DM failures, lock out for the cooldown. */
  DM_FAIL_THRESHOLD: 3,
  DM_LOCKOUT_MS: 24 * 60 * 60_000,
  /** Warn when distinct watched UUIDs cross this; alert at 2x. */
  WATCHED_WARN: 500,
  WATCHED_ALERT: 1000,
  /** Ratio of failed `tame.session()` calls that triggers backoff for next tick. */
  BAD_TICK_FAIL_RATIO: 0.5,
} as const;
