// streak.ts — pure streak/goal derivation engine. No platform APIs; no Date.now().
// Invariant: core imports no platform API (code-standards).

import type { ReadingSession } from './session.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_GOAL_TARGET_MINUTES = 20;
export const DEFAULT_GOAL_ACTIVE_MS = DEFAULT_GOAL_TARGET_MINUTES * 60_000;

export const FREEZE_EARN_EVERY = 5;
export const FREEZE_CAP = 2;

// ---------------------------------------------------------------------------
// nextLocalDay
// ---------------------------------------------------------------------------

/**
 * Return the next calendar-day label (YYYY-MM-DD) after `day`.
 * Uses UTC arithmetic on the date label — no tz/DST hazard because these are
 * date labels, not instants (invariant #4: local-day correctness lives in 07a).
 */
export function nextLocalDay(day: string): string {
  return new Date(Date.parse(day + 'T00:00:00Z') + 86_400_000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// activeMsByDay
// ---------------------------------------------------------------------------

/**
 * Sum activeMs per localDay across all sessions.
 * Returns a Map<localDay, totalActiveMs>.
 */
export function activeMsByDay(sessions: ReadingSession[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of sessions) {
    map.set(s.localDay, (map.get(s.localDay) ?? 0) + s.activeMs);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StreakStatus = 'lit' | 'at-risk' | 'broken';

export type StreakResult = {
  current: number;
  longest: number;
  freezesBanked: number;
  lastReadDay: string | null;
  status: StreakStatus;
};

export type TodayGoal = {
  targetActiveMs: number;
  activeMs: number;
  ratio: number;
  met: boolean;
};

export type HabitSummary = {
  streak: StreakResult;
  goal: TodayGoal;
};

// ---------------------------------------------------------------------------
// deriveStreak
// ---------------------------------------------------------------------------

/**
 * Pure forward simulation of the streak from `firstReadDay` to `today`.
 *
 * Rules (per spec):
 *   - read-day          → streak += 1; earn freeze if streak % earnEvery === 0 (capped); track longest.
 *   - missed, d === today → pending: stop walk (no break, no consume).
 *   - missed, banked > 0  → consume: banked -= 1; streak preserved (not incremented).
 *   - missed, banked === 0 → break: streak = 0, banked = 0.
 *
 * status: lit if today ∈ readDays; at-risk if current > 0; broken otherwise.
 */
export function deriveStreak(
  sessions: ReadingSession[],
  today: string,
  opts?: { earnEvery?: number; cap?: number },
): StreakResult {
  const earnEvery = opts?.earnEvery ?? FREEZE_EARN_EVERY;
  const cap = opts?.cap ?? FREEZE_CAP;

  const empty: StreakResult = {
    current: 0,
    longest: 0,
    freezesBanked: 0,
    lastReadDay: null,
    status: 'broken',
  };

  if (sessions.length === 0) return empty;

  // Build read-day set (derived from sessions — no mutation of input)
  const dayMap = activeMsByDay(sessions);
  // Only days with activeMs > 0 count (07a already drops zero-active slices, but be safe)
  const readDays = new Set<string>();
  for (const [day, ms] of dayMap) {
    if (ms > 0) readDays.add(day);
  }

  if (readDays.size === 0) return empty;

  // Find firstReadDay and lastReadDay from the set
  const sortedDays = [...readDays].sort();
  const firstReadDay = sortedDays[0]!;
  const lastReadDay = sortedDays[sortedDays.length - 1]!;

  // Forward simulation
  let streak = 0;
  let longest = 0;
  let banked = 0;

  let d = firstReadDay;
  while (d <= today) {
    if (readDays.has(d)) {
      // Read day
      streak += 1;
      if (streak % earnEvery === 0) {
        banked = Math.min(cap, banked + 1);
      }
      longest = Math.max(longest, streak);
    } else if (d === today) {
      // Today is unread — pending: stop without breaking
      break;
    } else if (banked > 0) {
      // Missed non-today day, freeze available — consume, preserve streak
      banked -= 1;
    } else {
      // Missed non-today day, no freeze — break
      streak = 0;
      banked = 0;
    }
    d = nextLocalDay(d);
  }

  // Determine status
  let status: StreakStatus;
  if (readDays.has(today)) {
    status = 'lit';
  } else if (streak > 0) {
    status = 'at-risk';
  } else {
    status = 'broken';
  }

  return {
    current: streak,
    longest,
    freezesBanked: banked,
    lastReadDay,
    status,
  };
}

// ---------------------------------------------------------------------------
// deriveTodayGoal
// ---------------------------------------------------------------------------

/**
 * Compute today's goal progress.
 * activeMs = sum of session.activeMs where session.localDay === today.
 * ratio = activeMs / targetActiveMs (raw; may exceed 1 — UI clamps for the ring).
 * met = activeMs >= targetActiveMs.
 */
export function deriveTodayGoal(
  sessions: ReadingSession[],
  today: string,
  targetActiveMs: number,
): TodayGoal {
  let activeMs = 0;
  for (const s of sessions) {
    if (s.localDay === today) activeMs += s.activeMs;
  }
  const ratio = targetActiveMs > 0 ? activeMs / targetActiveMs : 1;
  return {
    targetActiveMs,
    activeMs,
    ratio,
    met: activeMs >= targetActiveMs,
  };
}

// ---------------------------------------------------------------------------
// deriveHabitSummary
// ---------------------------------------------------------------------------

/**
 * Convenience composition — returns streak + today-goal in one call.
 * 08b/08c call this single seam.
 */
export function deriveHabitSummary(
  sessions: ReadingSession[],
  today: string,
  targetActiveMs = DEFAULT_GOAL_ACTIVE_MS,
): HabitSummary {
  return {
    streak: deriveStreak(sessions, today),
    goal: deriveTodayGoal(sessions, today, targetActiveMs),
  };
}
