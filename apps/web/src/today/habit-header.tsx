/**
 * habit-header.tsx — Today tab habit band: streak ember + goal ring.
 *
 * Consumes useHabitSummary(); renders a calm skeleton while loading
 * (no fake numbers — invariant #1), then the two glanceable surfaces.
 *
 * Card aesthetic consistent with ContinueReadingCard: rounded-2xl,
 * bg-surface-raised, border-line, generous padding.
 * Token-only styling (invariant #6).
 */

import { GoalRing } from './goal-ring.js';
import { StreakEmber } from './streak-ember.js';
import { useHabitSummary } from './use-habit-summary.js';

// ── Skeleton ──────────────────────────────────────────────────────────────────

function HabitSkeleton() {
  return (
    <div
      className="rounded-2xl bg-surface-raised border border-line px-6 py-5"
      aria-busy="true"
      aria-label="Loading habit summary"
    >
      <div className="flex items-center gap-6">
        {/* Ember skeleton */}
        <div className="flex items-start gap-3">
          {/* Flame placeholder */}
          <div
            className="w-11 h-13 rounded-full bg-line motion-safe:animate-pulse"
            aria-hidden="true"
          />
          {/* Text stack placeholder */}
          <div className="flex flex-col gap-1.5 pt-1">
            <div
              className="h-7 w-8 rounded bg-line motion-safe:animate-pulse"
              aria-hidden="true"
            />
            <div
              className="h-3.5 w-16 rounded bg-line motion-safe:animate-pulse"
              aria-hidden="true"
            />
            <div
              className="h-3 w-24 rounded bg-line motion-safe:animate-pulse"
              aria-hidden="true"
            />
          </div>
        </div>

        {/* Divider */}
        <div className="self-stretch w-px bg-line" aria-hidden="true" />

        {/* Ring skeleton */}
        <div
          className="w-24 h-24 rounded-full bg-line motion-safe:animate-pulse"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function HabitHeader() {
  const { view, loading } = useHabitSummary();

  if (loading) {
    return <HabitSkeleton />;
  }

  return (
    <div className="rounded-2xl bg-surface-raised border border-line px-6 py-5">
      <div className="flex items-center gap-6">
        {/* Left: streak ember — expressive, larger visual weight */}
        <div className="flex-1 min-w-0">
          <StreakEmber view={view} />
        </div>

        {/* Vertical divider */}
        <div className="self-stretch w-px bg-line shrink-0" aria-hidden="true" />

        {/* Right: goal ring — precise, informational */}
        <div className="shrink-0">
          <GoalRing view={view} />
        </div>
      </div>
    </div>
  );
}
