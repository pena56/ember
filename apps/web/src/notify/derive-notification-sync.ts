/**
 * derive-notification-sync.ts — pure planner adapter for web notification sync.
 *
 * Bridges 16a's planNotifications engine to the web hook's submit/suppress logic.
 * No I/O, no new Date() — caller injects now/tz (invariant #1: no clock calls here).
 *
 * Invariant #5: zero decision logic reinvented — all planning defers to 16a's engine.
 * Invariant #7: web submits the single selected + suppresses. The 16b ledger dedupes.
 */

import {
  DEFAULT_GOAL_ACTIVE_MS,
  deriveTodayGoal,
  localDayOf,
  NOTIFICATION_PRIORITY,
  planNotifications,
} from '@ember/core';
import type { NotificationConfig, NotificationPlan, NotificationType, ReadingSession } from '@ember/core';

import { notificationCopy } from './notification-copy.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface NotificationSyncInput {
  sessions: ReadingSession[];
  now: number;
  tzOffsetMinutes: number;
  config?: Partial<NotificationConfig>;
}

export interface SubmitIntent {
  plan: NotificationPlan;
  title: string;
  body: string;
}

export interface NotificationSyncPlan {
  /** The day's selected plan to submit (≤1/day), or null when goal is met / no candidate. */
  intent: SubmitIntent | null;
  /** dedupeKeys to claimSlot('suppressed') — populated only when goal is met. */
  suppress: string[];
}

// All notification types — derived from NOTIFICATION_PRIORITY (single source of truth).
const NOTIFICATION_TYPES = Object.keys(NOTIFICATION_PRIORITY) as NotificationType[];

// ── Pure adapter ───────────────────────────────────────────────────────────────

/**
 * Pure planner adapter: maps local sessions + wall-clock snapshot to the web
 * hook's submit/suppress plan.
 *
 * Two paths:
 *  - Goal met: suppress all four ${type}:${today} keys so no device nudges the user.
 *  - Goal not met: run planNotifications and return the single selected intent
 *    (with copy) if any candidate qualifies; suppress list is empty.
 */
export function deriveNotificationSync(input: NotificationSyncInput): NotificationSyncPlan {
  const { sessions, now, tzOffsetMinutes, config } = input;

  const today = localDayOf(now, tzOffsetMinutes);
  const goalTargetMs = config?.goalTargetMs ?? DEFAULT_GOAL_ACTIVE_MS;
  const goal = deriveTodayGoal(sessions, today, goalTargetMs);

  if (goal.met) {
    // User has read enough today — suppress all notification types for today so
    // no device fires. Claiming a key with no pending intent is harmless + idempotent.
    return {
      intent: null,
      suppress: NOTIFICATION_TYPES.map((t) => `${t}:${today}`),
    };
  }

  // Goal not met — let 16a's engine decide which (if any) notification to schedule.
  const { selected } = planNotifications(input);

  return {
    intent: selected
      ? { plan: selected, ...notificationCopy(selected.type) }
      : null,
    suppress: [],
  };
}
