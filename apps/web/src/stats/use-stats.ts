/**
 * use-stats.ts — hook: parallel fetch → derive analytics → presentStats → { view, loading }.
 *
 * Mirrors use-habit-summary.ts exactly:
 *  - cancel-flag + loading + swallow-errors pattern.
 *  - Swallows read errors → neutral default view (invariant #1: Stats must render
 *    offline even if a read fails).
 *  - today / window / tz computed here in the hook (never in the pure presenter).
 */

import { useEffect, useState } from 'react';

import {
  DEFAULT_GOAL_ACTIVE_MS,
  buildHeatmap,
  deriveAnalytics,
  deriveHabitSummary,
  localDayOf,
} from '@ember/core';

import { useWebStore } from '../store/store-context.js';

import type { StatsView } from './present-stats.js';
import { presentStats } from './present-stats.js';

// ── State ──────────────────────────────────────────────────────────────────────

export interface StatsState {
  view: StatsView;
  loading: boolean;
}

// ── Default (offline / error fallback) ────────────────────────────────────────

function defaultView(): StatsView {
  const tz = -new Date().getTimezoneOffset();
  const now = Date.now();
  const today = localDayOf(now, tz);
  const fromDay = localDayOf(now - 364 * 86_400_000, tz);
  const habit = deriveHabitSummary([], today, DEFAULT_GOAL_ACTIVE_MS);
  const analytics = deriveAnalytics([], [], []);
  const heatmap = buildHeatmap([], fromDay, today);
  return presentStats({ habit, analytics, heatmap, docs: [], sessions: [] });
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useStats(): StatsState {
  const store = useWebStore();
  const [view, setView] = useState<StatsView>(defaultView);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [sessions, docs, positions, goal] = await Promise.all([
          store.listSessions(),
          store.listDocuments(),
          store.listReadingPositions(),
          store.getGoalConfig(),
        ]);

        if (!cancelled) {
          const tz = -new Date().getTimezoneOffset();
          const now = Date.now();
          const today = localDayOf(now, tz);
          const fromDay = localDayOf(now - 364 * 86_400_000, tz);

          const habit = deriveHabitSummary(sessions, today, goal.targetActiveMs);
          const analytics = deriveAnalytics(sessions, docs, positions);
          const heatmap = buildHeatmap(sessions, fromDay, today);

          setView(presentStats({ habit, analytics, heatmap, docs, sessions }));
        }
      } catch {
        // Swallow read errors — return neutral empty view (invariant #1)
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
