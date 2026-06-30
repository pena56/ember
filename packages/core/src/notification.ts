// notification.ts — pure notification-decision engine. No platform APIs; no Date.now().
// Invariant #1: core imports no platform API (code-standards).
// Invariant #7: dedupeKey = `${type}:${localDay}` is the per-(type,day) key the 16b server
//               ledger will enforce for cross-device dedupe. Engine does not do election.

import type { ReadingSession } from './session.js';
import { localDayOf } from './session.js';
import {
  DEFAULT_GOAL_ACTIVE_MS,
  deriveStreak,
  deriveTodayGoal,
} from './streak.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationType =
  | 'streak-risk'
  | 'best-time'
  | 'goal-progress'
  | 'lapse-reengage';

export type NotificationPlan = {
  type: NotificationType;
  /** YYYY-MM-DD local calendar date this plan targets. */
  localDay: string;
  /** Server-side dedupe key (invariant #7). Format: `${type}:${localDay}`. */
  dedupeKey: string;
  /** Wall-clock ms epoch for the notification's scheduled local anchor hour on localDay. */
  scheduledWall: number;
  /** Lower = higher priority (see NOTIFICATION_PRIORITY). */
  priority: number;
};

/** Lower number = higher priority. Protect an active streak first, then push partial
 *  progress over the line, then the habitual nudge, then win-back last. */
export const NOTIFICATION_PRIORITY: Record<NotificationType, number> = {
  'streak-risk': 0,
  'goal-progress': 1,
  'best-time': 2,
  'lapse-reengage': 3,
};

/** All fields optional — supply any subset; the rest fall back to these defaults. */
export type NotificationConfig = {
  /** Daily reading goal in ms. Default: DEFAULT_GOAL_ACTIVE_MS (20 min). */
  goalTargetMs: number;
  /** Quiet window start (local hour, inclusive). Default: 8. */
  quietStartHour: number;
  /** Quiet window end (local hour, exclusive). Default: 22. */
  quietEndHour: number;
  /** Fallback notification hour when not enough session data. Default: 20. */
  defaultBestHour: number;
  /** How many recent sessions to inspect for modal hour. Default: 30. */
  bestTimeWindowSessions: number;
  /** Minimum sessions required before learning modal hour; below → defaultBestHour. Default: 5. */
  bestTimeMinSessions: number;
  /** Hour to send goal-progress nudge (local). Default: 15. */
  goalProgressHour: number;
  /** Hour to send streak-risk warning (local). Default: 21. */
  streakRiskHour: number;
  /** Days of inactivity before a lapse-reengage notification fires. Default: 3. */
  lapseDays: number;
  /** Per-type on/off gate. Default: all true (keys derived from NOTIFICATION_PRIORITY). */
  enabledTypes: Record<NotificationType, boolean>;
};

export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  goalTargetMs: DEFAULT_GOAL_ACTIVE_MS,
  quietStartHour: 8,
  quietEndHour: 22,
  defaultBestHour: 20,
  bestTimeWindowSessions: 30,
  bestTimeMinSessions: 5,
  goalProgressHour: 15,
  streakRiskHour: 21,
  lapseDays: 3,
  // Derive keys from NOTIFICATION_PRIORITY so it stays single-sourced (invariant #5).
  enabledTypes: Object.fromEntries(
    Object.keys(NOTIFICATION_PRIORITY).map((k) => [k, true]),
  ) as Record<NotificationType, boolean>,
};

// ---------------------------------------------------------------------------
// learnBestHour
// ---------------------------------------------------------------------------

/**
 * Returns the modal local start-hour across the most-recent `bestTimeWindowSessions`
 * sessions (sorted descending by startedAt, take N). Local hour of a session is derived
 * purely from wall epoch + tzOffsetMinutes — no Date.now().
 *
 * Falls back to `defaultBestHour` when fewer than `bestTimeMinSessions` sessions qualify.
 * Ties broken by the earliest hour (deterministic).
 */
export function learnBestHour(
  sessions: ReadingSession[],
  config?: Partial<NotificationConfig>,
): number {
  const cfg = { ...DEFAULT_NOTIFICATION_CONFIG, ...config };
  const { bestTimeWindowSessions, bestTimeMinSessions, defaultBestHour } = cfg;

  // Sort descending by startedAt to pick most-recent N
  const sorted = [...sessions].sort((a, b) => b.startedAt - a.startedAt);
  const window = sorted.slice(0, bestTimeWindowSessions);

  if (window.length < bestTimeMinSessions) return defaultBestHour;

  // Compute local hour for each session in the window
  const hourCounts = new Map<number, number>();
  for (const s of window) {
    const localMs = (s.startedAt + s.tzOffsetMinutes * 60_000) % 86_400_000;
    // localMs may be negative if startedAt < |tzOffsetMinutes * 60_000|; normalise
    const normLocalMs = ((localMs % 86_400_000) + 86_400_000) % 86_400_000;
    const hour = Math.floor(normLocalMs / 3_600_000);
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
  }

  // Modal hour; ties → earliest hour (sort ascending by hour, descending by count)
  let bestHour = defaultBestHour;
  let bestCount = 0;
  for (const [hour, count] of hourCounts) {
    if (count > bestCount || (count === bestCount && hour < bestHour)) {
      bestHour = hour;
      bestCount = count;
    }
  }

  return bestHour;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Number of calendar days between two YYYY-MM-DD labels (dayB − dayA).
 * Uses UTC epoch arithmetic on date labels — no tz math (labels are dates, not instants).
 * Mirrors nextLocalDay precedent from streak.ts.
 */
function daysBetween(dayA: string, dayB: string): number {
  const msA = Date.parse(dayA + 'T00:00:00Z');
  const msB = Date.parse(dayB + 'T00:00:00Z');
  return Math.round((msB - msA) / 86_400_000);
}

/**
 * Convert a YYYY-MM-DD label + local hour into a wall-clock ms epoch.
 * We build the UTC midnight for that label (via Date.parse with a Z suffix),
 * then subtract the tzOffset to land on the UTC instant that corresponds to
 * midnight local, then add the target hour in ms.
 *
 * No Date.now(); purely arithmetic over the supplied label.
 */
function scheduledWallFor(
  localDay: string,
  localHour: number,
  tzOffsetMinutes: number,
): number {
  // UTC midnight of the label
  const utcMidnight = Date.parse(localDay + 'T00:00:00Z');
  // Local midnight in wall ms = utcMidnight − tzOffsetMinutes*60_000
  const localMidnightWall = utcMidnight - tzOffsetMinutes * 60_000;
  return localMidnightWall + localHour * 3_600_000;
}

// ---------------------------------------------------------------------------
// planNotifications
// ---------------------------------------------------------------------------

export type PlanNotificationsInput = {
  sessions: ReadingSession[];
  now: number;
  tzOffsetMinutes: number;
  config?: Partial<NotificationConfig>;
};

export type PlanNotificationsResult = {
  candidates: NotificationPlan[];
  selected: NotificationPlan | null;
};

/**
 * Pure planner: decides what notification (if any) to schedule for today.
 *
 * Returns `candidates` (all qualifying plans, sorted ascending by priority) and
 * `selected` (the single highest-priority plan after quiet-hours filter, or null).
 * No side effects; no clock calls.
 */
export function planNotifications(input: PlanNotificationsInput): PlanNotificationsResult {
  const { sessions, now, tzOffsetMinutes } = input;
  const cfg: NotificationConfig = { ...DEFAULT_NOTIFICATION_CONFIG, ...input.config };

  const {
    goalTargetMs,
    quietStartHour,
    quietEndHour,
    defaultBestHour,
    goalProgressHour,
    streakRiskHour,
    lapseDays,
  } = cfg;

  // 1. Derive today's label and domain results
  const today = localDayOf(now, tzOffsetMinutes);
  const streak = deriveStreak(sessions, today);
  const goal = deriveTodayGoal(sessions, today, goalTargetMs);

  // Helper: build a NotificationPlan for the given type + anchor hour
  function makePlan(type: NotificationType, anchorHour: number): NotificationPlan {
    return {
      type,
      localDay: today,
      dedupeKey: `${type}:${today}`,
      scheduledWall: scheduledWallFor(today, anchorHour, tzOffsetMinutes),
      priority: NOTIFICATION_PRIORITY[type],
    };
  }

  // 2. Collect raw candidates (conditions per spec)
  const raw: NotificationPlan[] = [];

  // streak-risk: goal unmet AND streak current > 0 AND status !== 'lit'
  if (!goal.met && streak.current > 0 && streak.status !== 'lit') {
    raw.push(makePlan('streak-risk', streakRiskHour));
  }

  // goal-progress: goal unmet AND some partial progress today (activeMs > 0)
  if (!goal.met && goal.activeMs > 0) {
    raw.push(makePlan('goal-progress', goalProgressHour));
  }

  // best-time: goal unmet (habitual nudge; suppressed once goal is met)
  if (!goal.met) {
    const bestHour = learnBestHour(sessions, cfg);
    raw.push(makePlan('best-time', bestHour));
  }

  // lapse-reengage: streak broken AND enough days since last read AND ≥1 session exists
  if (streak.status === 'broken' && streak.lastReadDay !== null) {
    const since = daysBetween(streak.lastReadDay, today);
    if (since >= lapseDays) {
      raw.push(makePlan('lapse-reengage', defaultBestHour));
    }
  }

  // 2b. enabledTypes gate: drop candidates for disabled types.
  //     Runs after raw collection (conditions still evaluated) but before quiet-hours,
  //     so a disabled type is never scheduled regardless of its anchor hour.
  const gated = raw.filter((plan) => cfg.enabledTypes[plan.type]);

  // 3. Quiet-hours filter: keep only plans whose anchor hour is within [quietStartHour, quietEndHour)
  //    We recover the anchor hour from scheduledWall: reverse the scheduledWallFor transform.
  const withinQuiet = (plan: NotificationPlan): boolean => {
    // Recover the local hour from scheduledWall
    const utcMidnight = Date.parse(plan.localDay + 'T00:00:00Z');
    const localMidnightWall = utcMidnight - tzOffsetMinutes * 60_000;
    const localHour = Math.round((plan.scheduledWall - localMidnightWall) / 3_600_000);
    return localHour >= quietStartHour && localHour < quietEndHour;
  };

  const candidates = gated
    .filter(withinQuiet)
    .sort((a, b) => a.priority - b.priority);

  // 4. selected = single highest-priority survivor (≤1/day cap)
  const selected = candidates[0] ?? null;

  return { candidates, selected };
}
