/**
 * notification-sync.test.ts — pure planner adapter.
 *
 * Asserts:
 *  (1) goal met → intent === null + all four ${type}:${today} suppress keys
 *  (2) goal not met + qualifying session → intent.plan is 16a's selected with
 *      matching notificationCopy; suppress === []
 *  (3) goal not met + no qualifying candidate → intent === null, suppress === []
 *  (4) no new Date() inside (caller injects now/tz) — structural: the function
 *      is deterministic across calls with the same frozen now
 */

import { describe, expect, it } from 'vitest';

import { notificationCopy } from '../notification-copy.js';
import { deriveNotificationSync } from '../notification-sync.js';
import type { NotificationType } from '../notification.js';
import { NOTIFICATION_PRIORITY } from '../notification.js';
import type { ReadingSession } from '../session.js';
import { localDayOf } from '../session.js';


// All notification types, in priority order
const NOTIFICATION_TYPES = Object.keys(NOTIFICATION_PRIORITY) as NotificationType[];

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** A fixed "now" well inside a quiet window (e.g. 10:00 UTC+0). */
const NOW_MS = Date.parse('2025-07-15T10:00:00Z'); // wall 10:00 UTC
const TZ_UTC = 0;
const TODAY = localDayOf(NOW_MS, TZ_UTC); // '2025-07-15'

/** A reading session that starts just before NOW_MS and is long enough to meet the default 20-min goal. */
function goalMetSession(): ReadingSession {
  return {
    id: 'sess-1',
    docId: 'doc-1',
    localDay: TODAY,                  // stamped at capture (invariant #4)
    startedAt: NOW_MS - 25 * 60_000, // 25 minutes ago
    endedAt: NOW_MS,
    activeMs: 25 * 60_000,           // 25 min — exceeds 20-min default
    tzOffsetMinutes: TZ_UTC,
    pages: [1],
    updatedAt: '',
  };
}

/** A very short session that does NOT meet the goal but gives some partial progress (5 min). */
function partialSession(): ReadingSession {
  return {
    id: 'sess-2',
    docId: 'doc-1',
    localDay: TODAY,                  // stamped at capture (invariant #4)
    startedAt: NOW_MS - 5 * 60_000,
    endedAt: NOW_MS,
    activeMs: 5 * 60_000,            // 5 min — below 20-min default
    tzOffsetMinutes: TZ_UTC,
    pages: [1],
    updatedAt: '',
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('deriveNotificationSync', () => {
  it('(1) goal met → intent null + all four suppress keys for today', () => {
    const result = deriveNotificationSync({
      sessions: [goalMetSession()],
      now: NOW_MS,
      tzOffsetMinutes: TZ_UTC,
    });

    expect(result.intent).toBeNull();
    expect(result.suppress).toHaveLength(NOTIFICATION_TYPES.length);
    for (const type of NOTIFICATION_TYPES) {
      expect(result.suppress).toContain(`${type}:${TODAY}`);
    }
  });

  it('(2) goal not met + qualifying session → intent with plan + copy, suppress empty', () => {
    // partial session with streak-enabling history so at least one plan qualifies.
    // With a partial session and at least some sessions, planNotifications should
    // produce a goal-progress candidate (activeMs > 0).
    const result = deriveNotificationSync({
      sessions: [partialSession()],
      now: NOW_MS,
      tzOffsetMinutes: TZ_UTC,
    });

    // suppress must be empty when goal is not met
    expect(result.suppress).toEqual([]);

    // intent should be non-null (there is a partial session today → goal-progress fires)
    expect(result.intent).not.toBeNull();
    if (result.intent === null) return; // type narrowing

    // plan fields are from 16a's planNotifications
    expect(result.intent.plan.type).toBeTypeOf('string');
    expect(result.intent.plan.dedupeKey).toBe(`${result.intent.plan.type}:${result.intent.plan.localDay}`);
    expect(result.intent.plan.localDay).toBe(TODAY);
    expect(result.intent.plan.scheduledWall).toBeTypeOf('number');

    // copy is sourced from notificationCopy
    const expectedCopy = notificationCopy(result.intent.plan.type as NotificationType);
    expect(result.intent.title).toBe(expectedCopy.title);
    expect(result.intent.body).toBe(expectedCopy.body);
  });

  it('(3) goal not met + no candidates (quiet hour covers all) → intent null, suppress empty', () => {
    // Set now to 03:00 UTC (outside quiet window 08–22) — all candidate anchor hours
    // fall outside the quiet window so planNotifications returns selected === null.
    // NOTE: The default bestTimeMinSessions is 5; with 0 sessions the best-time
    // candidate uses defaultBestHour (20), which IS in the quiet window. So instead
    // we override config to push all hours out of the quiet window.
    const nowOutsideQuiet = Date.parse('2025-07-15T03:00:00Z');
    // No sessions at all → no streak, no partial progress, no lapse (no lastReadDay).
    const result = deriveNotificationSync({
      sessions: [],
      now: nowOutsideQuiet,
      tzOffsetMinutes: TZ_UTC,
      // Override hours so every candidate fires at 3 AM (outside 08-22 quiet window)
      config: {
        goalProgressHour: 3,
        streakRiskHour: 3,
        defaultBestHour: 3,
      },
    });

    expect(result.intent).toBeNull();
    expect(result.suppress).toEqual([]);
  });

  it('(4) is deterministic — same inputs always produce the same output (no new Date() inside)', () => {
    const input = {
      sessions: [partialSession()],
      now: NOW_MS,
      tzOffsetMinutes: TZ_UTC,
    };
    const r1 = deriveNotificationSync(input);
    const r2 = deriveNotificationSync(input);

    // Deep structural equality — if new Date() were called inside,
    // results might differ across real-time runs.
    expect(r1).toEqual(r2);
  });

  it('(5) suppress keys are exactly ${type}:${today} for each of the four types', () => {
    const result = deriveNotificationSync({
      sessions: [goalMetSession()],
      now: NOW_MS,
      tzOffsetMinutes: TZ_UTC,
    });

    const expected = NOTIFICATION_TYPES.map((t) => `${t}:${TODAY}`);
    expect(result.suppress.sort()).toEqual(expected.sort());
  });
});
