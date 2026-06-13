/**
 * use-habit-summary.ts — hook: fetch all sessions + goal config in parallel,
 * derive HabitSummary, map to HabitView. Returns a loading flag.
 *
 * Mirrors use-continue-reading.ts's cancel-flag + loading + swallow-errors pattern.
 * Swallows read errors → neutral default view (invariant #1: Today must render
 * offline even if a read fails).
 */

import { useEffect, useState } from 'react';

import {
  DEFAULT_GOAL_ACTIVE_MS,
  deriveHabitSummary,
  localDayOf,
} from '@ember/core';

import { useWebStore } from '../store/store-context.js';

import type { HabitView } from './present-habit.js';
import { presentHabit } from './present-habit.js';

// ── State ─────────────────────────────────────────────────────────────────────

export interface HabitSummaryState {
  view: HabitView;
  loading: boolean;
}

// ── Default (offline / error fallback) ────────────────────────────────────────

function defaultView(): HabitView {
  const today = localDayOf(Date.now(), -new Date().getTimezoneOffset());
  return presentHabit(deriveHabitSummary([], today, DEFAULT_GOAL_ACTIVE_MS));
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useHabitSummary(): HabitSummaryState {
  const store = useWebStore();
  const [view, setView] = useState<HabitView>(defaultView);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const today = localDayOf(Date.now(), -new Date().getTimezoneOffset());
        const [sessions, goal] = await Promise.all([
          store.listSessions(),
          store.getGoalConfig(),
        ]);
        if (!cancelled) {
          const summary = deriveHabitSummary(sessions, today, goal.targetActiveMs);
          setView(presentHabit(summary));
        }
      } catch {
        // Swallow read errors — return neutral broken/empty view (invariant #1)
        if (!cancelled) {
          setView(defaultView());
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [store]);

  return { view, loading };
}
