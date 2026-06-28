// notification.test.ts — pure notification-decision engine tests.
// No platform APIs; no Date.now(). All fixtures use fixed epochs + explicit tzOffsetMinutes.

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_NOTIFICATION_CONFIG,
  NOTIFICATION_PRIORITY,
  learnBestHour,
  planNotifications,
  type NotificationConfig,
} from '../notification.js';
import type { ReadingSession } from '../session.js';
import { localDayOf } from '../session.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let _id = 0;

/**
 * Build a minimal ReadingSession with explicit startedAt, localDay, tzOffsetMinutes,
 * and activeMs. Remaining fields are defaults.
 */
function mk(
  localDay: string,
  activeMs: number,
  opts: { startedAt?: number; tzOffsetMinutes?: number } = {},
): ReadingSession {
  const tzOffsetMinutes = opts.tzOffsetMinutes ?? 0;
  // If startedAt not supplied, compute a synthetic wall epoch that lands on the given
  // localDay at 20:00 local. This keeps the fixture readable without caring about tz.
  const startedAt =
    opts.startedAt ??
    // midnight UTC of that day label, then adjust for tz offset, then add 20h local
    Date.parse(localDay + 'T00:00:00Z') - tzOffsetMinutes * 60_000 + 20 * 3_600_000;
  return {
    id: `s${++_id}`,
    docId: 'doc-test',
    localDay,
    tzOffsetMinutes,
    startedAt,
    endedAt: startedAt + activeMs,
    activeMs,
    pages: [1],
    updatedAt: '',
  };
}

// A fixed "now" that resolves to 2026-06-28 at 14:00 UTC (UTC+0).
// localDayOf(NOW_UTC, 0) === '2026-06-28'
const NOW_UTC = Date.parse('2026-06-28T14:00:00Z'); // 14:00 local in UTC+0
const TODAY_UTC = '2026-06-28';

// A fixed "now" for UTC+5:30 (IST, +330 min).
// localDayOf(NOW_IST, 330) should still be '2026-06-28' (14:00 + 5:30 = 19:30 local)
const NOW_IST = Date.parse('2026-06-28T08:30:00Z'); // 08:30 UTC = 14:00 IST
const TODAY_IST = '2026-06-28';

// A fixed "now" for UTC-5 (EST, -300 min).
// localDayOf(NOW_EST, -300) === '2026-06-28' (14:00 UTC = 09:00 local)
const NOW_EST = Date.parse('2026-06-28T14:00:00Z');
const TODAY_EST = '2026-06-28';

// ---------------------------------------------------------------------------
// NOTIFICATION_PRIORITY ordering
// ---------------------------------------------------------------------------

describe('NOTIFICATION_PRIORITY', () => {
  it('streak-risk has the lowest numeric value (highest priority)', () => {
    expect(NOTIFICATION_PRIORITY['streak-risk']).toBe(0);
  });

  it('goal-progress < best-time < lapse-reengage', () => {
    expect(NOTIFICATION_PRIORITY['goal-progress']).toBeLessThan(
      NOTIFICATION_PRIORITY['best-time'],
    );
    expect(NOTIFICATION_PRIORITY['best-time']).toBeLessThan(
      NOTIFICATION_PRIORITY['lapse-reengage'],
    );
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_NOTIFICATION_CONFIG
// ---------------------------------------------------------------------------

describe('DEFAULT_NOTIFICATION_CONFIG', () => {
  it('exports expected defaults', () => {
    expect(DEFAULT_NOTIFICATION_CONFIG.quietStartHour).toBe(8);
    expect(DEFAULT_NOTIFICATION_CONFIG.quietEndHour).toBe(22);
    expect(DEFAULT_NOTIFICATION_CONFIG.defaultBestHour).toBe(20);
    expect(DEFAULT_NOTIFICATION_CONFIG.bestTimeWindowSessions).toBe(30);
    expect(DEFAULT_NOTIFICATION_CONFIG.bestTimeMinSessions).toBe(5);
    expect(DEFAULT_NOTIFICATION_CONFIG.goalProgressHour).toBe(15);
    expect(DEFAULT_NOTIFICATION_CONFIG.streakRiskHour).toBe(21);
    expect(DEFAULT_NOTIFICATION_CONFIG.lapseDays).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// learnBestHour — below minimum sessions → defaultBestHour
// ---------------------------------------------------------------------------

describe('learnBestHour — below minimum', () => {
  it('returns defaultBestHour when fewer than bestTimeMinSessions sessions', () => {
    // Only 4 sessions (default minimum is 5)
    const sessions = [
      mk('2026-06-24', 1000, { startedAt: Date.parse('2026-06-24T19:00:00Z') }),
      mk('2026-06-25', 1000, { startedAt: Date.parse('2026-06-25T19:00:00Z') }),
      mk('2026-06-26', 1000, { startedAt: Date.parse('2026-06-26T19:00:00Z') }),
      mk('2026-06-27', 1000, { startedAt: Date.parse('2026-06-27T19:00:00Z') }),
    ];
    expect(learnBestHour(sessions)).toBe(DEFAULT_NOTIFICATION_CONFIG.defaultBestHour);
  });

  it('returns defaultBestHour for empty session list', () => {
    expect(learnBestHour([])).toBe(DEFAULT_NOTIFICATION_CONFIG.defaultBestHour);
  });

  it('respects custom bestTimeMinSessions', () => {
    // 3 sessions, minimum = 3 → should compute modal rather than fall back
    const sessions = [
      mk('2026-06-24', 1000, { startedAt: Date.parse('2026-06-24T09:00:00Z') }),
      mk('2026-06-25', 1000, { startedAt: Date.parse('2026-06-25T09:00:00Z') }),
      mk('2026-06-26', 1000, { startedAt: Date.parse('2026-06-26T09:00:00Z') }),
    ];
    const result = learnBestHour(sessions, { bestTimeMinSessions: 3 });
    // All three sessions at 09:00 UTC → modal hour = 9
    expect(result).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// learnBestHour — modal hour (UTC+0)
// ---------------------------------------------------------------------------

describe('learnBestHour — modal hour (UTC+0)', () => {
  it('returns the hour that appears most frequently', () => {
    // 5 sessions: 3 at 20:00, 2 at 19:00 UTC → modal = 20
    const sessions: ReadingSession[] = [
      mk('2026-06-23', 1000, { startedAt: Date.parse('2026-06-23T20:00:00Z'), tzOffsetMinutes: 0 }),
      mk('2026-06-24', 1000, { startedAt: Date.parse('2026-06-24T20:00:00Z'), tzOffsetMinutes: 0 }),
      mk('2026-06-25', 1000, { startedAt: Date.parse('2026-06-25T20:00:00Z'), tzOffsetMinutes: 0 }),
      mk('2026-06-26', 1000, { startedAt: Date.parse('2026-06-26T19:00:00Z'), tzOffsetMinutes: 0 }),
      mk('2026-06-27', 1000, { startedAt: Date.parse('2026-06-27T19:00:00Z'), tzOffsetMinutes: 0 }),
    ];
    expect(learnBestHour(sessions)).toBe(20);
  });

  it('tie → earliest hour wins', () => {
    // 6 sessions: 2 at 19:00, 2 at 20:00, 2 at 21:00 → three-way tie → hour 19 wins
    const sessions: ReadingSession[] = [
      mk('2026-06-22', 1000, { startedAt: Date.parse('2026-06-22T19:00:00Z'), tzOffsetMinutes: 0 }),
      mk('2026-06-23', 1000, { startedAt: Date.parse('2026-06-23T19:00:00Z'), tzOffsetMinutes: 0 }),
      mk('2026-06-24', 1000, { startedAt: Date.parse('2026-06-24T20:00:00Z'), tzOffsetMinutes: 0 }),
      mk('2026-06-25', 1000, { startedAt: Date.parse('2026-06-25T20:00:00Z'), tzOffsetMinutes: 0 }),
      mk('2026-06-26', 1000, { startedAt: Date.parse('2026-06-26T21:00:00Z'), tzOffsetMinutes: 0 }),
      mk('2026-06-27', 1000, { startedAt: Date.parse('2026-06-27T21:00:00Z'), tzOffsetMinutes: 0 }),
    ];
    expect(learnBestHour(sessions)).toBe(19);
  });

  it('two-way tie → earlier hour wins (19 vs 21)', () => {
    // 5 sessions: 2 at 21:00, 2 at 19:00, 1 at 18:00 → tie between 19 and 21 → 19 wins
    const sessions: ReadingSession[] = [
      mk('2026-06-23', 1000, { startedAt: Date.parse('2026-06-23T19:00:00Z'), tzOffsetMinutes: 0 }),
      mk('2026-06-24', 1000, { startedAt: Date.parse('2026-06-24T19:00:00Z'), tzOffsetMinutes: 0 }),
      mk('2026-06-25', 1000, { startedAt: Date.parse('2026-06-25T21:00:00Z'), tzOffsetMinutes: 0 }),
      mk('2026-06-26', 1000, { startedAt: Date.parse('2026-06-26T21:00:00Z'), tzOffsetMinutes: 0 }),
      mk('2026-06-27', 1000, { startedAt: Date.parse('2026-06-27T18:00:00Z'), tzOffsetMinutes: 0 }),
    ];
    expect(learnBestHour(sessions)).toBe(19);
  });
});

// ---------------------------------------------------------------------------
// learnBestHour — tz offset math (positive offset)
// ---------------------------------------------------------------------------

describe('learnBestHour — positive tz offset (UTC+5:30)', () => {
  it('computes local hour correctly for IST (+330 min)', () => {
    // Sessions at 14:30 UTC → 20:00 IST (local hour = 20)
    // We need 5 sessions minimum
    const sessions: ReadingSession[] = Array.from({ length: 5 }, (_, i) => {
      const day = localDayOf(Date.parse(`2026-06-2${i + 2}T14:30:00Z`), 330);
      return mk(day, 1000, {
        startedAt: Date.parse(`2026-06-2${i + 2}T14:30:00Z`),
        tzOffsetMinutes: 330,
      });
    });
    // 14:30 UTC + 330 min (5:30) = 20:00 local → hour 20
    expect(learnBestHour(sessions)).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// learnBestHour — tz offset math (negative offset)
// ---------------------------------------------------------------------------

describe('learnBestHour — negative tz offset (UTC-5)', () => {
  it('computes local hour correctly for EST (-300 min)', () => {
    // Sessions at 01:00 UTC → 20:00 EST (local hour = 20, previous day)
    // startedAt at 01:00 UTC, tzOffset = -300: local = 01:00 - 5h = 20:00 (previous local day)
    const sessions: ReadingSession[] = Array.from({ length: 5 }, (_, i) => {
      const startedAt = Date.parse(`2026-06-2${i + 2}T01:00:00Z`);
      const day = localDayOf(startedAt, -300);
      return mk(day, 1000, { startedAt, tzOffsetMinutes: -300 });
    });
    // 01:00 UTC - 300 min = 20:00 local → hour 20
    expect(learnBestHour(sessions)).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// learnBestHour — window slicing (uses only most-recent N sessions)
// ---------------------------------------------------------------------------

describe('learnBestHour — window slicing', () => {
  it('uses only most-recent bestTimeWindowSessions sessions', () => {
    // 35 sessions: 30 most recent at hour 9, 5 oldest at hour 20
    // With default window=30 → modal should be 9 (the recent ones)
    const baseSessions: ReadingSession[] = [];
    // Older 5 sessions at hour 20
    for (let i = 0; i < 5; i++) {
      const startedAt = Date.parse(`2026-05-${String(i + 1).padStart(2, '0')}T20:00:00Z`);
      baseSessions.push(mk(localDayOf(startedAt, 0), 1000, { startedAt, tzOffsetMinutes: 0 }));
    }
    // Newer 30 sessions at hour 9
    for (let i = 0; i < 30; i++) {
      const startedAt = Date.parse(`2026-06-${String(i + 1).padStart(2, '0')}T09:00:00Z`) ;
      baseSessions.push(mk(localDayOf(startedAt, 0), 1000, { startedAt, tzOffsetMinutes: 0 }));
    }
    expect(learnBestHour(baseSessions)).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// planNotifications — streak-risk fires under correct conditions
// ---------------------------------------------------------------------------

describe('planNotifications — streak-risk', () => {
  it('fires when goal unmet, streak current > 0, status at-risk', () => {
    // Read yesterday, not today → at-risk streak
    const sessions = [
      mk('2026-06-27', 1_200_001), // yesterday, well over goal
    ];
    const { candidates, selected } = planNotifications({
      sessions,
      now: NOW_UTC,
      tzOffsetMinutes: 0,
    });

    const plan = candidates.find((c) => c.type === 'streak-risk');
    expect(plan).toBeDefined();
    expect(selected?.type).toBe('streak-risk'); // highest priority
  });

  it('is suppressed when goal is already met today (goal.met === true)', () => {
    const goalMs = DEFAULT_NOTIFICATION_CONFIG.goalTargetMs;
    const sessions = [
      mk('2026-06-27', goalMs), // yesterday
      mk(TODAY_UTC, goalMs),    // today — goal met
    ];
    const { candidates } = planNotifications({
      sessions,
      now: NOW_UTC,
      tzOffsetMinutes: 0,
    });
    expect(candidates.find((c) => c.type === 'streak-risk')).toBeUndefined();
  });

  it('is suppressed when streak.status === lit (read today)', () => {
    const goalMs = DEFAULT_NOTIFICATION_CONFIG.goalTargetMs;
    const sessions = [
      mk(TODAY_UTC, goalMs), // read today → lit + goal met
    ];
    const { candidates } = planNotifications({
      sessions,
      now: NOW_UTC,
      tzOffsetMinutes: 0,
    });
    expect(candidates.find((c) => c.type === 'streak-risk')).toBeUndefined();
  });

  it('is suppressed when streak.current === 0 (no active streak)', () => {
    // No sessions → current=0, status=broken
    const { candidates } = planNotifications({
      sessions: [],
      now: NOW_UTC,
      tzOffsetMinutes: 0,
    });
    expect(candidates.find((c) => c.type === 'streak-risk')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// planNotifications — goal-progress fires under correct conditions
// ---------------------------------------------------------------------------

describe('planNotifications — goal-progress', () => {
  it('fires when goal unmet and partial progress today', () => {
    const goalMs = DEFAULT_NOTIFICATION_CONFIG.goalTargetMs;
    // Some progress but not enough
    const sessions = [mk(TODAY_UTC, Math.floor(goalMs / 2))];
    const { candidates } = planNotifications({
      sessions,
      now: NOW_UTC,
      tzOffsetMinutes: 0,
    });
    expect(candidates.find((c) => c.type === 'goal-progress')).toBeDefined();
  });

  it('is suppressed when goal is met', () => {
    const goalMs = DEFAULT_NOTIFICATION_CONFIG.goalTargetMs;
    const sessions = [mk(TODAY_UTC, goalMs)];
    const { candidates } = planNotifications({
      sessions,
      now: NOW_UTC,
      tzOffsetMinutes: 0,
    });
    expect(candidates.find((c) => c.type === 'goal-progress')).toBeUndefined();
  });

  it('is suppressed when no progress today (activeMs === 0)', () => {
    // Sessions exist but none today
    const sessions = [mk('2026-06-27', 1000)];
    const { candidates } = planNotifications({
      sessions,
      now: NOW_UTC,
      tzOffsetMinutes: 0,
    });
    expect(candidates.find((c) => c.type === 'goal-progress')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// planNotifications — best-time fires under correct conditions
// ---------------------------------------------------------------------------

describe('planNotifications — best-time', () => {
  it('fires when goal is not met', () => {
    // No sessions today → goal unmet
    const { candidates } = planNotifications({
      sessions: [],
      now: NOW_UTC,
      tzOffsetMinutes: 0,
    });
    expect(candidates.find((c) => c.type === 'best-time')).toBeDefined();
  });

  it('is suppressed when goal is met', () => {
    const goalMs = DEFAULT_NOTIFICATION_CONFIG.goalTargetMs;
    const sessions = [mk(TODAY_UTC, goalMs)];
    const { candidates } = planNotifications({
      sessions,
      now: NOW_UTC,
      tzOffsetMinutes: 0,
    });
    expect(candidates.find((c) => c.type === 'best-time')).toBeUndefined();
  });

  it('uses learnBestHour anchor, falls back to defaultBestHour for few sessions', () => {
    // With no sessions, best-time should anchor at defaultBestHour (20)
    const { candidates } = planNotifications({
      sessions: [],
      now: NOW_UTC,
      tzOffsetMinutes: 0,
    });
    const plan = candidates.find((c) => c.type === 'best-time');
    expect(plan).toBeDefined();
    // scheduledWall should reflect defaultBestHour = 20 local
    // UTC midnight of 2026-06-28 = 1751068800000, localMidnightWall = same (tz=0)
    // + 20h = 1751068800000 + 20*3600000 = 1751140800000
    const utcMidnight = Date.parse('2026-06-28T00:00:00Z');
    const expected = utcMidnight + 20 * 3_600_000;
    expect(plan!.scheduledWall).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// planNotifications — lapse-reengage fires under correct conditions
// ---------------------------------------------------------------------------

describe('planNotifications — lapse-reengage', () => {
  it('fires after lapseDays of no reading (status broken, ≥1 session)', () => {
    // Last read 5 days ago (default lapseDays = 3)
    const sessions = [mk('2026-06-23', 1000)];
    const { candidates } = planNotifications({
      sessions,
      now: NOW_UTC,
      tzOffsetMinutes: 0,
    });
    expect(candidates.find((c) => c.type === 'lapse-reengage')).toBeDefined();
  });

  it('is NOT fired with zero sessions (nothing to re-engage)', () => {
    const { candidates } = planNotifications({
      sessions: [],
      now: NOW_UTC,
      tzOffsetMinutes: 0,
    });
    expect(candidates.find((c) => c.type === 'lapse-reengage')).toBeUndefined();
  });

  it('is NOT fired when streak is active (at-risk)', () => {
    // Read yesterday → at-risk, not broken
    const sessions = [mk('2026-06-27', 1000)];
    const { candidates } = planNotifications({
      sessions,
      now: NOW_UTC,
      tzOffsetMinutes: 0,
    });
    expect(candidates.find((c) => c.type === 'lapse-reengage')).toBeUndefined();
  });

  it('is NOT fired when lapseDays threshold not yet reached', () => {
    // Last read 2 days ago (below lapseDays=3)
    const sessions = [mk('2026-06-26', 1000)];
    const { candidates } = planNotifications({
      sessions,
      now: NOW_UTC,
      tzOffsetMinutes: 0,
    });
    expect(candidates.find((c) => c.type === 'lapse-reengage')).toBeUndefined();
  });

  it('fires exactly at lapseDays threshold', () => {
    // Last read exactly 3 days ago (= lapseDays)
    const sessions = [mk('2026-06-25', 1000)];
    const { candidates } = planNotifications({
      sessions,
      now: NOW_UTC,
      tzOffsetMinutes: 0,
    });
    expect(candidates.find((c) => c.type === 'lapse-reengage')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// planNotifications — quiet-hours filter
// ---------------------------------------------------------------------------

describe('planNotifications — quiet-hours filter', () => {
  it('drops candidates whose anchor hour is outside quiet window', () => {
    // streakRiskHour = 21, but set quietEndHour = 21 → 21 is excluded (window is [8,21))
    const sessions = [mk('2026-06-27', 1000)]; // at-risk streak
    const config: Partial<NotificationConfig> = {
      quietStartHour: 8,
      quietEndHour: 21, // streak-risk at 21 is now outside
    };
    const { candidates } = planNotifications({
      sessions,
      now: NOW_UTC,
      tzOffsetMinutes: 0,
      config,
    });
    expect(candidates.find((c) => c.type === 'streak-risk')).toBeUndefined();
  });

  it('keeps candidates inside quiet window', () => {
    // goalProgressHour = 15 is inside default [8, 22)
    const goalMs = DEFAULT_NOTIFICATION_CONFIG.goalTargetMs;
    const sessions = [mk(TODAY_UTC, Math.floor(goalMs / 2))];
    const { candidates } = planNotifications({
      sessions,
      now: NOW_UTC,
      tzOffsetMinutes: 0,
    });
    expect(candidates.find((c) => c.type === 'goal-progress')).toBeDefined();
  });

  it('drops all candidates when all anchor hours are outside quiet window → selected = null', () => {
    // Shrink quiet window to [23, 24) so nothing fits
    const sessions = [mk('2026-06-27', 1000)];
    const config: Partial<NotificationConfig> = {
      quietStartHour: 23,
      quietEndHour: 24,
    };
    const { candidates, selected } = planNotifications({
      sessions,
      now: NOW_UTC,
      tzOffsetMinutes: 0,
      config,
    });
    expect(candidates).toHaveLength(0);
    expect(selected).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// planNotifications — selected is null when no candidates
// ---------------------------------------------------------------------------

describe('planNotifications — selected null when no survivors', () => {
  it('selected is null when nothing qualifies (goal met, no streak, quiet window empty)', () => {
    const goalMs = DEFAULT_NOTIFICATION_CONFIG.goalTargetMs;
    const sessions = [mk(TODAY_UTC, goalMs)]; // goal met → no best-time or goal-progress or streak-risk
    // No lapse either since streak.lastReadDay = today means not broken
    const { selected } = planNotifications({
      sessions,
      now: NOW_UTC,
      tzOffsetMinutes: 0,
    });
    expect(selected).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// planNotifications — selected = highest-priority single survivor (≤1/day cap)
// ---------------------------------------------------------------------------

describe('planNotifications — priority ordering', () => {
  it('selected = streak-risk when both streak-risk and best-time qualify', () => {
    // streak-risk fires when: goal unmet + streak.current > 0 + status !== lit
    // best-time fires when: goal unmet
    // Both fire when reading yesterday but NOT today (at-risk) with goal unmet today.
    // Note: goal-progress requires activeMs > 0 today; if today has no sessions,
    // goal-progress does NOT fire. streak-risk DOES fire (status=at-risk, not lit).
    const goalMs = DEFAULT_NOTIFICATION_CONFIG.goalTargetMs;
    const sessions = [
      mk('2026-06-27', goalMs), // yesterday → streak.current=1, status=at-risk today
    ];
    const { candidates, selected } = planNotifications({
      sessions,
      now: NOW_UTC,
      tzOffsetMinutes: 0,
    });
    expect(candidates.find((c) => c.type === 'streak-risk')).toBeDefined();
    expect(candidates.find((c) => c.type === 'best-time')).toBeDefined();
    expect(selected?.type).toBe('streak-risk');
  });

  it('candidates are sorted ascending by priority number', () => {
    const goalMs = DEFAULT_NOTIFICATION_CONFIG.goalTargetMs;
    // At-risk streak (read yesterday, not today) → streak-risk + best-time both qualify
    const sessions = [mk('2026-06-27', goalMs)];
    const { candidates } = planNotifications({
      sessions,
      now: NOW_UTC,
      tzOffsetMinutes: 0,
    });
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i]!.priority).toBeGreaterThanOrEqual(candidates[i - 1]!.priority);
    }
  });

  it('selected = goal-progress when streak-risk is absent (no active streak)', () => {
    const goalMs = DEFAULT_NOTIFICATION_CONFIG.goalTargetMs;
    // Partial progress today, no previous sessions → no streak
    const sessions = [mk(TODAY_UTC, Math.floor(goalMs / 2))];
    const { selected } = planNotifications({
      sessions,
      now: NOW_UTC,
      tzOffsetMinutes: 0,
    });
    // No streak → streak-risk absent; goal-progress present; best-time present
    // selected should be goal-progress (priority 1 < best-time 2)
    expect(selected?.type).toBe('goal-progress');
  });
});

// ---------------------------------------------------------------------------
// planNotifications — dedupeKey format
// ---------------------------------------------------------------------------

describe('planNotifications — dedupeKey', () => {
  it('dedupeKey === `${type}:${localDay}` for each candidate', () => {
    const sessions = [mk('2026-06-27', 1000)]; // at-risk streak, no today sessions
    const { candidates } = planNotifications({
      sessions,
      now: NOW_UTC,
      tzOffsetMinutes: 0,
    });
    for (const plan of candidates) {
      expect(plan.dedupeKey).toBe(`${plan.type}:${plan.localDay}`);
      expect(plan.localDay).toBe(TODAY_UTC);
    }
  });
});

// ---------------------------------------------------------------------------
// planNotifications — scheduledWall lands on correct local hour
// ---------------------------------------------------------------------------

describe('planNotifications — scheduledWall', () => {
  it('scheduledWall for streak-risk lands on streakRiskHour (21) local for UTC+0', () => {
    const sessions = [mk('2026-06-27', 1000)];
    const { candidates } = planNotifications({
      sessions,
      now: NOW_UTC,
      tzOffsetMinutes: 0,
    });
    const plan = candidates.find((c) => c.type === 'streak-risk');
    expect(plan).toBeDefined();
    // UTC midnight of 2026-06-28 + 21h
    const expected = Date.parse('2026-06-28T00:00:00Z') + 21 * 3_600_000;
    expect(plan!.scheduledWall).toBe(expected);
  });

  it('scheduledWall for streak-risk lands on correct wall epoch for UTC+5:30 (+330)', () => {
    // now = 2026-06-28T08:30:00Z → 14:00 IST on 2026-06-28 (TODAY_IST).
    // We need a session on 2026-06-27 IST (yesterday) to produce at-risk streak.
    // 2026-06-27 at e.g. 10:00 IST = 2026-06-27T04:30:00Z UTC.
    const startedAtYesterdayIST = Date.parse('2026-06-27T04:30:00Z'); // 10:00 IST Jun 27
    const yesterdayIST = localDayOf(startedAtYesterdayIST, 330); // should be '2026-06-27'
    const sessionsIST: ReadingSession[] = [
      mk(yesterdayIST, 1000, {
        startedAt: startedAtYesterdayIST,
        tzOffsetMinutes: 330,
      }),
    ];
    expect(yesterdayIST).toBe('2026-06-27'); // sanity check

    const { candidates } = planNotifications({
      sessions: sessionsIST,
      now: NOW_IST,
      tzOffsetMinutes: 330,
    });
    const plan = candidates.find((c) => c.type === 'streak-risk');
    expect(plan).toBeDefined();
    // localDay should be '2026-06-28' for IST now
    expect(plan!.localDay).toBe(TODAY_IST);
    // scheduledWall: localMidnightWall for 2026-06-28 IST
    // = UTC midnight of 2026-06-28 minus 330 min offset
    // = 2026-06-27T18:30:00Z  then + 21h
    const utcMidnight = Date.parse('2026-06-28T00:00:00Z');
    const localMidnightWall = utcMidnight - 330 * 60_000;
    const expected = localMidnightWall + 21 * 3_600_000;
    expect(plan!.scheduledWall).toBe(expected);
  });

  it('scheduledWall for streak-risk lands on correct wall epoch for UTC-5 (-300)', () => {
    const sessions = [
      mk('2026-06-27', 1000, {
        startedAt: Date.parse('2026-06-28T04:30:00Z'), // 27 Jun 23:30 EST → day 27 EST
        tzOffsetMinutes: -300,
      }),
    ];
    const { candidates } = planNotifications({
      sessions,
      now: NOW_EST,
      tzOffsetMinutes: -300,
    });
    const plan = candidates.find((c) => c.type === 'streak-risk');
    expect(plan).toBeDefined();
    expect(plan!.localDay).toBe(TODAY_EST);
    // localMidnightWall for EST: UTC midnight 2026-06-28 - (-300*60000) = UTC midnight + 300min
    const utcMidnight = Date.parse('2026-06-28T00:00:00Z');
    const localMidnightWall = utcMidnight - -300 * 60_000;
    const expected = localMidnightWall + 21 * 3_600_000;
    expect(plan!.scheduledWall).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// planNotifications — purity (no input mutation)
// ---------------------------------------------------------------------------

describe('planNotifications — purity', () => {
  it('does not mutate the input sessions array', () => {
    const sessions = [mk('2026-06-27', 1000)];
    const snapshot = JSON.stringify(sessions);
    planNotifications({ sessions, now: NOW_UTC, tzOffsetMinutes: 0 });
    expect(JSON.stringify(sessions)).toBe(snapshot);
  });
});

// ---------------------------------------------------------------------------
// planNotifications — config override
// ---------------------------------------------------------------------------

describe('planNotifications — config override', () => {
  it('respects custom goalTargetMs', () => {
    // With a tiny goal (1ms), any session today meets it
    const sessions = [mk(TODAY_UTC, 10)];
    const { candidates } = planNotifications({
      sessions,
      now: NOW_UTC,
      tzOffsetMinutes: 0,
      config: { goalTargetMs: 1 },
    });
    // goal met → no best-time, no goal-progress, no streak-risk
    expect(candidates.find((c) => c.type === 'best-time')).toBeUndefined();
    expect(candidates.find((c) => c.type === 'goal-progress')).toBeUndefined();
    expect(candidates.find((c) => c.type === 'streak-risk')).toBeUndefined();
  });

  it('respects custom lapseDays', () => {
    // Last read 2 days ago; with lapseDays=2 it should fire
    const sessions = [mk('2026-06-26', 1000)];
    const { candidates } = planNotifications({
      sessions,
      now: NOW_UTC,
      tzOffsetMinutes: 0,
      config: { lapseDays: 2 },
    });
    expect(candidates.find((c) => c.type === 'lapse-reengage')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Edge: exactly one notification when only lapse qualifies (no active streak)
// ---------------------------------------------------------------------------

describe('planNotifications — lapse only', () => {
  it('selected = lapse-reengage when it is the only qualifying notification', () => {
    // ≥5 old sessions all started at 03:00 UTC → learnBestHour modal = 3 (outside quiet
    // window). All ≥8 days ago → streak broken, lastReadDay set ⇒ lapse qualifies.
    // best-time anchor (hour 3) is dropped by quiet hours; lapse anchor = defaultBestHour
    // (10, inside window) survives ⇒ lapse-reengage is genuinely the sole candidate.
    const sessions = [
      mk('2026-06-16', 1000, { startedAt: Date.parse('2026-06-16T03:00:00Z') }),
      mk('2026-06-17', 1000, { startedAt: Date.parse('2026-06-17T03:00:00Z') }),
      mk('2026-06-18', 1000, { startedAt: Date.parse('2026-06-18T03:00:00Z') }),
      mk('2026-06-19', 1000, { startedAt: Date.parse('2026-06-19T03:00:00Z') }),
      mk('2026-06-20', 1000, { startedAt: Date.parse('2026-06-20T03:00:00Z') }),
    ];
    const config: Partial<NotificationConfig> = {
      defaultBestHour: 10, // lapse-reengage anchor — inside [8,22)
      quietStartHour: 8,
      quietEndHour: 22,
    };
    const { candidates, selected } = planNotifications({
      sessions,
      now: NOW_UTC,
      tzOffsetMinutes: 0,
      config,
    });
    expect(candidates.map((c) => c.type)).toEqual(['lapse-reengage']);
    expect(selected?.type).toBe('lapse-reengage');
  });

  it('lapse-reengage is not emitted for zero sessions even with old lastReadDay', () => {
    // Regression: zero sessions → lastReadDay = null → no lapse
    const { candidates } = planNotifications({
      sessions: [],
      now: NOW_UTC,
      tzOffsetMinutes: 0,
    });
    expect(candidates.find((c) => c.type === 'lapse-reengage')).toBeUndefined();
  });
});
