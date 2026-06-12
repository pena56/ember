// today-goal.test.ts — tests for deriveTodayGoal and deriveHabitSummary.
// No platform APIs; no Date.now().

import { describe, expect, it } from 'vitest';

import type { ReadingSession } from '../session.js';
import {
  DEFAULT_GOAL_ACTIVE_MS,
  DEFAULT_GOAL_TARGET_MINUTES,
  deriveHabitSummary,
  deriveTodayGoal,
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

const TODAY = '2026-06-12';
const TARGET = DEFAULT_GOAL_ACTIVE_MS; // 20 min = 1_200_000 ms

describe('deriveTodayGoal', () => {
  it('sums only today sessions — ignores other days', () => {
    const sessions = [
      mk(TODAY, 600_000),       // 10 min today
      mk('2026-06-11', 900_000), // yesterday — ignored
    ];
    const result = deriveTodayGoal(sessions, TODAY, TARGET);
    expect(result.activeMs).toBe(600_000);
  });

  it('met is true when activeMs >= targetActiveMs (exact)', () => {
    const sessions = [mk(TODAY, TARGET)];
    const result = deriveTodayGoal(sessions, TODAY, TARGET);
    expect(result.met).toBe(true);
    expect(result.ratio).toBe(1);
  });

  it('met is false when below target', () => {
    const sessions = [mk(TODAY, TARGET - 1)];
    const result = deriveTodayGoal(sessions, TODAY, TARGET);
    expect(result.met).toBe(false);
    expect(result.ratio).toBeLessThan(1);
  });

  it('ratio > 1 when over target (UI should clamp for ring)', () => {
    const sessions = [mk(TODAY, TARGET * 2)];
    const result = deriveTodayGoal(sessions, TODAY, TARGET);
    expect(result.ratio).toBe(2);
    expect(result.met).toBe(true);
  });

  it('ignores sessions from days other than today', () => {
    const sessions = [
      mk('2026-06-10', 500_000),
      mk('2026-06-11', 700_000),
    ];
    const result = deriveTodayGoal(sessions, TODAY, TARGET);
    expect(result.activeMs).toBe(0);
    expect(result.met).toBe(false);
  });

  it('returns targetActiveMs from the argument', () => {
    const sessions = [mk(TODAY, 60_000)];
    const result = deriveTodayGoal(sessions, TODAY, TARGET);
    expect(result.targetActiveMs).toBe(TARGET);
  });

  it('sums multiple today sessions', () => {
    const sessions = [mk(TODAY, 300_000), mk(TODAY, 300_000), mk(TODAY, 600_000)];
    const result = deriveTodayGoal(sessions, TODAY, TARGET);
    expect(result.activeMs).toBe(1_200_000);
    expect(result.met).toBe(true);
  });
});

describe('DEFAULT_GOAL_TARGET_MINUTES', () => {
  it('is 20', () => {
    expect(DEFAULT_GOAL_TARGET_MINUTES).toBe(20);
  });

  it('DEFAULT_GOAL_ACTIVE_MS = 20 * 60_000', () => {
    expect(DEFAULT_GOAL_ACTIVE_MS).toBe(20 * 60_000);
  });
});

describe('deriveHabitSummary', () => {
  it('composes deriveStreak and deriveTodayGoal into a single result', () => {
    const sessions = [mk(TODAY, TARGET)];
    const result = deriveHabitSummary(sessions, TODAY, TARGET);

    expect(result.streak).toBeDefined();
    expect(result.goal).toBeDefined();
    expect(result.streak.status).toBe('lit');
    expect(result.goal.met).toBe(true);
    expect(result.goal.activeMs).toBe(TARGET);
  });

  it('uses DEFAULT_GOAL_ACTIVE_MS when no targetActiveMs passed', () => {
    const sessions = [mk(TODAY, DEFAULT_GOAL_ACTIVE_MS)];
    const result = deriveHabitSummary(sessions, TODAY);
    expect(result.goal.targetActiveMs).toBe(DEFAULT_GOAL_ACTIVE_MS);
  });
});
