/**
 * present-habit.ts — pure HabitSummary → HabitView mapper.
 *
 * No DOM, no React, no Date. All formatting/clamping/pluralization logic lives
 * here so it is unit-tested without rendering (no headless RN renderer — invariant #3).
 * Per-platform copy of the web presenter (house style — each app keeps its own
 * thin presenter; cf. 07c's session-tracker copy).
 */

import type { HabitSummary, StreakStatus } from '@ember/core';

// ── View model ────────────────────────────────────────────────────────────────

export interface HabitView {
  streakCount: number;
  streakStatus: StreakStatus;
  /** Word(s) after the count — "Start your streak" (zero) or "N day(s)" */
  streakLabel: string;
  /** Status-aware warm sublabel */
  streakSublabel: string;
  freezesBanked: number;
  /** Arc fraction clamped to [0, 1] */
  ringFraction: number;
  /** Rounded active minutes (may exceed targetMinutes when over goal) */
  goalMinutes: number;
  targetMinutes: number;
  /** e.g. "12 / 20 min" — uses the real (over-target-allowed) goalMinutes */
  goalLabel: string;
  goalMet: boolean;
}

// ── Presenter ─────────────────────────────────────────────────────────────────

export function presentHabit(summary: HabitSummary): HabitView {
  const { streak, goal } = summary;

  // Ring fraction — clamp to [0, 1]; raw ratio may exceed 1 when over target
  const ringFraction = Math.min(1, Math.max(0, goal.ratio));

  // Minutes — rounded; goalMinutes reflects the real active (may be > targetMinutes)
  const goalMinutes = Math.round(goal.activeMs / 60_000);
  const targetMinutes = Math.round(goal.targetActiveMs / 60_000);
  const goalLabel = `${goalMinutes} / ${targetMinutes} min`;

  // Streak label
  const n = streak.current;
  let streakLabel: string;
  if (n === 0) {
    streakLabel = 'Start your streak';
  } else {
    streakLabel = `${n} day${n === 1 ? '' : 's'}`;
  }

  // Streak sublabel — status-aware, warm, non-guilt
  let streakSublabel: string;
  if (streak.status === 'lit') {
    streakSublabel = 'Lit today';
  } else if (streak.status === 'at-risk') {
    streakSublabel = 'Read today to keep it lit';
  } else {
    // broken or zero
    streakSublabel = 'A few minutes is all it takes';
  }

  return {
    streakCount: n,
    streakStatus: streak.status,
    streakLabel,
    streakSublabel,
    freezesBanked: streak.freezesBanked,
    ringFraction,
    goalMinutes,
    targetMinutes,
    goalLabel,
    goalMet: goal.met,
  };
}
