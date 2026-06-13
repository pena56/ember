/**
 * present-habit.test.ts — pure unit tests for the presentHabit view-model mapper.
 * No DOM, no React, no Date — purely mapping HabitSummary → HabitView.
 */

import { describe, expect, it } from 'vitest';

import type { HabitSummary } from '@ember/core';
import { DEFAULT_GOAL_ACTIVE_MS } from '@ember/core';

import { presentHabit } from './present-habit.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSummary(overrides: Partial<{
  current: number;
  status: 'lit' | 'at-risk' | 'broken';
  freezesBanked: number;
  activeMs: number;
  targetActiveMs: number;
  ratio: number;
  met: boolean;
}>): HabitSummary {
  const targetActiveMs = overrides.targetActiveMs ?? DEFAULT_GOAL_ACTIVE_MS;
  const activeMs = overrides.activeMs ?? 0;
  const ratio = overrides.ratio ?? (targetActiveMs > 0 ? activeMs / targetActiveMs : 0);
  return {
    streak: {
      current: overrides.current ?? 0,
      longest: 0,
      freezesBanked: overrides.freezesBanked ?? 0,
      lastReadDay: null,
      status: overrides.status ?? 'broken',
    },
    goal: {
      targetActiveMs,
      activeMs,
      ratio,
      met: overrides.met ?? activeMs >= targetActiveMs,
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('presentHabit — broken/empty summary', () => {
  it('returns streakCount 0 and Start your streak label', () => {
    const view = presentHabit(makeSummary({}));
    expect(view.streakCount).toBe(0);
    expect(view.streakLabel).toBe('Start your streak');
  });

  it('returns ringFraction 0', () => {
    const view = presentHabit(makeSummary({}));
    expect(view.ringFraction).toBe(0);
  });

  it('returns goalLabel 0 / 20 min', () => {
    const view = presentHabit(makeSummary({}));
    expect(view.goalLabel).toBe('0 / 20 min');
  });

  it('returns goalMet false', () => {
    const view = presentHabit(makeSummary({}));
    expect(view.goalMet).toBe(false);
  });

  it('returns warm broken sublabel', () => {
    const view = presentHabit(makeSummary({}));
    expect(view.streakSublabel).toBe('A few minutes is all it takes');
  });
});

describe('presentHabit — streak pluralization', () => {
  it('current 1 → "1 day" (singular)', () => {
    const view = presentHabit(makeSummary({ current: 1, status: 'lit' }));
    expect(view.streakLabel).toBe('1 day');
  });

  it('current 3 → "3 days" (plural)', () => {
    const view = presentHabit(makeSummary({ current: 3, status: 'lit' }));
    expect(view.streakLabel).toBe('3 days');
  });
});

describe('presentHabit — streak status sublabels', () => {
  it('lit → "Lit today"', () => {
    const view = presentHabit(makeSummary({ current: 2, status: 'lit' }));
    expect(view.streakSublabel).toBe('Lit today');
    expect(view.streakStatus).toBe('lit');
  });

  it('at-risk → "Read today to keep it lit"', () => {
    const view = presentHabit(makeSummary({ current: 2, status: 'at-risk' }));
    expect(view.streakSublabel).toBe('Read today to keep it lit');
    expect(view.streakStatus).toBe('at-risk');
  });

  it('broken (zero count) → warm broken copy', () => {
    const view = presentHabit(makeSummary({ current: 0, status: 'broken' }));
    expect(view.streakSublabel).toBe('A few minutes is all it takes');
  });
});

describe('presentHabit — ring fraction clamping', () => {
  it('ratio 0.5 → ringFraction 0.5', () => {
    const view = presentHabit(makeSummary({ ratio: 0.5, activeMs: 600_000, met: false }));
    expect(view.ringFraction).toBe(0.5);
  });

  it('ratio 1 → ringFraction 1, goalMet true', () => {
    const view = presentHabit(makeSummary({
      ratio: 1,
      activeMs: DEFAULT_GOAL_ACTIVE_MS,
      met: true,
    }));
    expect(view.ringFraction).toBe(1);
    expect(view.goalMet).toBe(true);
  });

  it('ratio 1.7 (over target) → ringFraction clamped to 1, goalMet true, minutes reflect real active', () => {
    const targetActiveMs = DEFAULT_GOAL_ACTIVE_MS; // 1_200_000 ms = 20 min
    const activeMs = Math.round(targetActiveMs * 1.7); // over target
    const view = presentHabit(makeSummary({
      ratio: 1.7,
      activeMs,
      targetActiveMs,
      met: true,
    }));
    expect(view.ringFraction).toBe(1);
    expect(view.goalMet).toBe(true);
    // goalMinutes should reflect the real over-target active, not be capped at target
    expect(view.goalMinutes).toBeGreaterThan(view.targetMinutes);
  });
});

describe('presentHabit — minutes rounding', () => {
  it('activeMs 750_000 → goalMinutes 13 (12.5 → rounds up)', () => {
    const view = presentHabit(makeSummary({ activeMs: 750_000, ratio: 750_000 / DEFAULT_GOAL_ACTIVE_MS }));
    expect(view.goalMinutes).toBe(13);
  });

  it('reflects non-default target in targetMinutes', () => {
    const view = presentHabit(makeSummary({ targetActiveMs: 30 * 60_000, activeMs: 0, ratio: 0 }));
    expect(view.targetMinutes).toBe(30);
  });
});

describe('presentHabit — freezes banked', () => {
  it('freezesBanked passes through (e.g. 2)', () => {
    const view = presentHabit(makeSummary({ freezesBanked: 2 }));
    expect(view.freezesBanked).toBe(2);
  });

  it('freezesBanked 0 passes through as 0', () => {
    const view = presentHabit(makeSummary({ freezesBanked: 0 }));
    expect(view.freezesBanked).toBe(0);
  });
});
