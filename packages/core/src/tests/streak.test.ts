// streak.test.ts — pure derivation tests for deriveStreak.
// No platform APIs; no Date.now(). Fixtures built with mk() helper.

import { describe, expect, it } from 'vitest';

import type { ReadingSession } from '../session.js';
import {
  FREEZE_CAP,
  FREEZE_EARN_EVERY,
  deriveStreak,
  nextLocalDay,
} from '../streak.js';

// ---------------------------------------------------------------------------
// Fixture helper
// ---------------------------------------------------------------------------

let _id = 0;
function mk(localDay: string, activeMs: number): ReadingSession {
  return {
    id: `s${++_id}`,
    docId: 'doc-test',
    localDay,
    tzOffsetMinutes: 0,
    startedAt: 0,
    endedAt: activeMs,
    activeMs,
    pages: [1],
    updatedAt: '',
  };
}

// ---------------------------------------------------------------------------
// nextLocalDay
// ---------------------------------------------------------------------------

describe('nextLocalDay', () => {
  it('rolls month boundary Feb→Mar in a non-leap year', () => {
    expect(nextLocalDay('2026-02-28')).toBe('2026-03-01');
  });

  it('rolls year boundary Dec→Jan', () => {
    expect(nextLocalDay('2026-12-31')).toBe('2027-01-01');
  });

  it('increments a normal mid-month day', () => {
    expect(nextLocalDay('2025-06-10')).toBe('2025-06-11');
  });
});

// ---------------------------------------------------------------------------
// deriveStreak — empty / no sessions
// ---------------------------------------------------------------------------

describe('deriveStreak — empty', () => {
  it('returns zero-state for empty session list', () => {
    const result = deriveStreak([], '2026-06-12');
    expect(result).toEqual({
      current: 0,
      longest: 0,
      freezesBanked: 0,
      lastReadDay: null,
      status: 'broken',
    });
  });
});

// ---------------------------------------------------------------------------
// deriveStreak — consecutive run ending today
// ---------------------------------------------------------------------------

describe('deriveStreak — consecutive run ending today', () => {
  it('3 consecutive days including today → current 3, status lit, lastReadDay = today', () => {
    const today = '2026-06-12';
    const sessions = [
      mk('2026-06-10', 1000),
      mk('2026-06-11', 1000),
      mk('2026-06-12', 1000),
    ];
    const result = deriveStreak(sessions, today);
    expect(result.current).toBe(3);
    expect(result.status).toBe('lit');
    expect(result.lastReadDay).toBe(today);
  });
});

// ---------------------------------------------------------------------------
// deriveStreak — read yesterday, not today (at-risk)
// ---------------------------------------------------------------------------

describe('deriveStreak — at-risk (read yesterday, not today)', () => {
  it('today is pending — status at-risk, streak preserved through yesterday', () => {
    const today = '2026-06-12';
    const sessions = [
      mk('2026-06-10', 1000),
      mk('2026-06-11', 1000),
    ];
    const result = deriveStreak(sessions, today);
    expect(result.status).toBe('at-risk');
    expect(result.current).toBe(2);
    expect(result.lastReadDay).toBe('2026-06-11');
  });
});

// ---------------------------------------------------------------------------
// deriveStreak — plain break (no freeze)
// ---------------------------------------------------------------------------

describe('deriveStreak — plain break', () => {
  it('run of 4, then a missed non-today day with no freeze → current 0, longest 4', () => {
    // Day layout: read 4 consecutive days, then miss one non-today day, today unread
    // Walk: d1..d4 read (streak 4), d5 missed non-today banked=0 → break
    const today = '2026-06-12';
    const sessions = [
      mk('2026-06-06', 1000),
      mk('2026-06-07', 1000),
      mk('2026-06-08', 1000),
      mk('2026-06-09', 1000),
      // 2026-06-10 — missed (non-today) with banked=0 → break
      // 2026-06-11 — also missed (non-today) → streak already 0
      // today 2026-06-12 — unread, pending
    ];
    const result = deriveStreak(sessions, today);
    expect(result.current).toBe(0);
    expect(result.longest).toBe(4);
    expect(result.status).toBe('broken');
  });
});

// ---------------------------------------------------------------------------
// deriveStreak — earn + cap
// ---------------------------------------------------------------------------

describe('deriveStreak — earn + cap freezes', () => {
  it(`${FREEZE_EARN_EVERY} consecutive days → freezesBanked 1`, () => {
    const today = '2026-06-05';
    const sessions = [
      mk('2026-06-01', 1000),
      mk('2026-06-02', 1000),
      mk('2026-06-03', 1000),
      mk('2026-06-04', 1000),
      mk('2026-06-05', 1000),
    ];
    const result = deriveStreak(sessions, today);
    expect(result.freezesBanked).toBe(1);
    expect(result.current).toBe(5);
  });

  it('10 consecutive days → freezesBanked 2', () => {
    // Days 1-10 consecutive ending on today
    const days = Array.from({ length: 10 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 4, 1) + i * 86_400_000);
      return d.toISOString().slice(0, 10);
    });
    const today = days[9]!;
    const sessions = days.map((d) => mk(d, 1000));
    const result = deriveStreak(sessions, today);
    expect(result.freezesBanked).toBe(2);
    expect(result.current).toBe(10);
  });

  it(`15 consecutive days → freezesBanked still ${FREEZE_CAP} (cap)`, () => {
    const days = Array.from({ length: 15 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 3, 1) + i * 86_400_000);
      return d.toISOString().slice(0, 10);
    });
    const today = days[14]!;
    const sessions = days.map((d) => mk(d, 1000));
    const result = deriveStreak(sessions, today);
    expect(result.freezesBanked).toBe(FREEZE_CAP);
    expect(result.current).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// deriveStreak — auto-consume freeze
// ---------------------------------------------------------------------------

describe('deriveStreak — auto-consume', () => {
  it('5 read days (earn 1 freeze), miss one non-today day, read today → streak 6, freezesBanked 0, status lit', () => {
    // Days 1-5: read (earn 1 freeze at day 5)
    // Day 6: missed non-today → consume freeze (streak preserved at 5, not incremented)
    // Day 7 (today): read → streak 6
    const sessions = [
      mk('2026-06-01', 1000),
      mk('2026-06-02', 1000),
      mk('2026-06-03', 1000),
      mk('2026-06-04', 1000),
      mk('2026-06-05', 1000),
      // 2026-06-06 missed — freeze consumed
      mk('2026-06-07', 1000), // today
    ];
    const today = '2026-06-07';
    const result = deriveStreak(sessions, today);
    expect(result.current).toBe(6);
    expect(result.freezesBanked).toBe(0);
    expect(result.status).toBe('lit');
  });
});

// ---------------------------------------------------------------------------
// deriveStreak — freezes exhausted
// ---------------------------------------------------------------------------

describe('deriveStreak — freezes exhausted', () => {
  it('1 banked freeze, two consecutive missed non-today days → first frozen, second breaks → current 0', () => {
    // 5 read days → 1 freeze banked, then 2 missed non-today days
    const sessions = [
      mk('2026-05-01', 1000),
      mk('2026-05-02', 1000),
      mk('2026-05-03', 1000),
      mk('2026-05-04', 1000),
      mk('2026-05-05', 1000),
      // 2026-05-06 missed → freeze consumed (banked→0)
      // 2026-05-07 missed → break (banked=0)
    ];
    const today = '2026-06-12'; // far in the future — both missed days are non-today
    const result = deriveStreak(sessions, today);
    expect(result.current).toBe(0);
    expect(result.status).toBe('broken');
  });
});

// ---------------------------------------------------------------------------
// deriveStreak — longest across runs
// ---------------------------------------------------------------------------

describe('deriveStreak — longest across runs', () => {
  it('run of 4, break, run of 2 ending today → longest 4, current 2', () => {
    const today = '2026-06-12';
    const sessions = [
      mk('2026-06-01', 1000),
      mk('2026-06-02', 1000),
      mk('2026-06-03', 1000),
      mk('2026-06-04', 1000),
      // 2026-06-05 missed → break
      mk('2026-06-11', 1000),
      mk('2026-06-12', 1000),
    ];
    const result = deriveStreak(sessions, today);
    expect(result.longest).toBe(4);
    expect(result.current).toBe(2);
    expect(result.status).toBe('lit');
  });
});

// ---------------------------------------------------------------------------
// deriveStreak — multiple sessions, one day
// ---------------------------------------------------------------------------

describe('deriveStreak — multiple sessions same day', () => {
  it('two sessions on the same localDay count the day once for streak', () => {
    const today = '2026-06-12';
    const sessions = [
      mk('2026-06-12', 1000),
      mk('2026-06-12', 2000),
    ];
    const result = deriveStreak(sessions, today);
    expect(result.current).toBe(1);
    expect(result.status).toBe('lit');
  });
});

// ---------------------------------------------------------------------------
// deriveStreak — purity (no input mutation)
// ---------------------------------------------------------------------------

describe('deriveStreak — purity', () => {
  it('does not mutate the input array', () => {
    const today = '2026-06-12';
    const sessions = [mk('2026-06-12', 1000), mk('2026-06-11', 1000)];
    const snapshot = JSON.stringify(sessions);
    deriveStreak(sessions, today);
    expect(JSON.stringify(sessions)).toBe(snapshot);
  });
});
