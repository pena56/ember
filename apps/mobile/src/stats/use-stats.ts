/**
 * use-stats.ts — hook: fetch sessions + docs + positions + goal in parallel,
 * derive AnalyticsSummary + HabitSummary + heatmap, map to StatsView.
 *
 * Mirrors use-habit-summary.ts's ready/store gate + cancel-flag + loading +
 * swallow-errors pattern. Swallows read errors → neutral default view
 * (invariant #1: Stats must render offline even if a read fails).
 *
 * Clock calls (tz/now/today/fromDay) are made INSIDE the hook (not the presenter)
 * so the presenter remains pure (invariant #3 — no Date in present-stats.ts).
 */

import { useEffect, useState } from 'react';

import {
  DEFAULT_GOAL_ACTIVE_MS,
  buildHeatmap,
  deriveAnalytics,
  deriveHabitSummary,
  localDayOf,
} from '@ember/core';

import { useNativeStore } from '../store/store-context.js';

import type { StatsView } from './present-stats.js';
import { presentStats } from './present-stats.js';

// ── State ─────────────────────────────────────────────────────────────────────

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
  return presentStats({
    habit: deriveHabitSummary([], today, DEFAULT_GOAL_ACTIVE_MS),
    analytics: deriveAnalytics([], [], []),
    heatmap: buildHeatmap([], fromDay, today),
    docs: [],
    sessions: [],
  });
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useStats(): StatsState {
  const { store, ready } = useNativeStore();
  const [view, setView] = useState<StatsView>(defaultView);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready || !store) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        // Compute temporal context from device clock (invariant: no Date in presenter)
        const tz = -new Date().getTimezoneOffset();
        const now = Date.now();
        const today = localDayOf(now, tz);
        const fromDay = localDayOf(now - 364 * 86_400_000, tz);

        const [sessions, docs, positions, goal] = await Promise.all([
          store!.listSessions(),
          store!.listDocuments(),
          store!.listReadingPositions(),
          store!.getGoalConfig(),
        ]);

        if (!cancelled) {
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
  }, [store, ready]);

  return { view, loading };
}
