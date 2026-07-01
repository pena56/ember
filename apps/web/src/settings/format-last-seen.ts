/**
 * format-last-seen.ts — pure relative-time formatter for device last-seen timestamps.
 *
 * Mirrors format-hour.ts style: pure, no platform deps, `now` is INJECTED so
 * callers (the screen route) pass Date.now() and the function stays clock-free
 * and trivially testable.
 *
 * No platform dependencies; safe to import in tests.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const SEC = 1_000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// ── Formatter ─────────────────────────────────────────────────────────────────

/**
 * Format a `lastSeenAt` epoch-ms timestamp relative to `now`.
 *
 * - Negative delta (clock skew) → "Active just now"
 * - < 60 s                      → "Active just now"
 * - < 60 min                    → "Active Nm ago"
 * - < 24 h                      → "Active Nh ago"
 * - ≥ 24 h                      → "Active Nd ago"
 *
 * Integer floor at each unit (e.g. 90 min → "Active 1h ago").
 * `now` is INJECTED — no `Date.now()` inside (pure, testable, clock-free component).
 */
export function formatRelativeLastSeen(now: number, lastSeenAt: number): string {
  const delta = now - lastSeenAt;

  // Negative delta (future lastSeenAt / clock skew) and sub-60s both clamp to "just now".
  if (delta < MIN) return 'Active just now';
  if (delta < HOUR) return `Active ${Math.floor(delta / MIN)}m ago`;
  if (delta < DAY) return `Active ${Math.floor(delta / HOUR)}h ago`;
  return `Active ${Math.floor(delta / DAY)}d ago`;
}
