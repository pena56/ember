/**
 * stats-page.tsx — the Stats tab: calm analytics overview.
 *
 * Six sections: Streak / Activity / Totals / Time of day / Your books.
 * Matches today-page.tsx column shell: mx-auto w-full max-w-2xl px-6 py-10.
 * Loading → calm skeleton (no fake numbers).
 * !hasData → warm empty state ("Your story starts with a single page.").
 * Token-only styling (invariant #6).
 */

import { ActivityHeatmap } from './activity-heatmap.js';
import { BookProgressList } from './book-progress-list.js';
import { StreakStat } from './streak-stat.js';
import { TimeOfDayStat } from './time-of-day-stat.js';
import { TotalsStat } from './totals-stat.js';
import { useStats } from './use-stats.js';

// ── Skeleton ───────────────────────────────────────────────────────────────────

function StatsSkeleton() {
  return (
    <div
      className="flex flex-col gap-4"
      role="status"
      aria-label="Loading your reading stats"
    >
      {/* Streak card skeleton */}
      <div className="rounded-2xl bg-surface-raised border border-line px-6 py-5">
        <div className="h-3 w-14 rounded bg-line motion-safe:animate-pulse mb-4" aria-hidden="true" />
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="h-12 w-20 rounded bg-line motion-safe:animate-pulse" aria-hidden="true" />
            <div className="h-3 w-36 rounded bg-line motion-safe:animate-pulse" aria-hidden="true" />
          </div>
          <div className="h-8 w-16 rounded bg-line motion-safe:animate-pulse" aria-hidden="true" />
        </div>
      </div>

      {/* Heatmap card skeleton */}
      <div className="rounded-2xl bg-surface-raised border border-line px-6 py-5">
        <div className="h-3 w-14 rounded bg-line motion-safe:animate-pulse mb-4" aria-hidden="true" />
        <div className="h-20 w-full rounded bg-line motion-safe:animate-pulse" aria-hidden="true" />
      </div>

      {/* Totals card skeleton */}
      <div className="rounded-2xl bg-surface-raised border border-line px-6 py-5">
        <div className="h-3 w-20 rounded bg-line motion-safe:animate-pulse mb-4" aria-hidden="true" />
        <div className="grid grid-cols-2 gap-x-6 gap-y-5">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="flex flex-col gap-1">
              <div className="h-7 w-16 rounded bg-line motion-safe:animate-pulse" aria-hidden="true" />
              <div className="h-3 w-20 rounded bg-line motion-safe:animate-pulse" aria-hidden="true" />
            </div>
          ))}
        </div>
      </div>

      {/* Two more card skeletons */}
      {[0, 1].map(i => (
        <div key={i} className="rounded-2xl bg-surface-raised border border-line px-6 py-5">
          <div className="h-3 w-24 rounded bg-line motion-safe:animate-pulse mb-4" aria-hidden="true" />
          <div className="flex flex-col gap-3">
            {[0, 1, 2, 3].map(j => (
              <div key={j} className="h-4 w-full rounded bg-line motion-safe:animate-pulse" aria-hidden="true" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────

function StatsEmpty() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
      {/* Quiet ember mark */}
      <svg
        width="32"
        height="40"
        viewBox="0 0 44 56"
        fill="none"
        aria-hidden="true"
        className="text-text-muted opacity-30"
      >
        <path
          d="M22 2C22 2 6 18 6 32C6 41.941 13.163 50 22 50C30.837 50 38 41.941 38 32C38 22 30 14 27 8C27 8 26 20 22 23C18 20 22 2 22 2Z"
          fill="currentColor"
        />
        <path
          d="M22 23C22 23 14 31 14 37C14 41.418 17.582 45 22 45C26.418 45 30 41.418 30 37C30 31 22 23 22 23Z"
          fill="currentColor"
          fillOpacity="0.4"
        />
      </svg>

      <div className="flex flex-col gap-2">
        <p className="font-serif text-xl font-semibold text-text leading-snug text-balance">
          Your story starts with a single page.
        </p>
        <p className="font-sans text-sm text-text-muted leading-relaxed max-w-xs mx-auto">
          Open a book to begin — your reading patterns will appear here.
        </p>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export function StatsPage() {
  const { view, loading } = useStats();

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10 flex flex-col gap-10">
      {/* Page heading */}
      <div className="flex flex-col gap-1.5">
        <h1 className="font-serif text-4xl font-semibold text-text leading-tight tracking-tight text-balance">
          Your reading
        </h1>
        <p className="font-sans text-sm text-text-muted mt-0.5">
          A quiet record of the time you&apos;ve spent with books.
        </p>
      </div>

      {/* Thin section separator */}
      <div className="h-px w-12 bg-line -mt-6" aria-hidden="true" />

      {/* Content — aria-live so AT announces when stats load in */}
      <div aria-live="polite" aria-atomic="false">
      {loading ? (
        <StatsSkeleton />
      ) : !view.hasData ? (
        <StatsEmpty />
      ) : (
        <div className="flex flex-col gap-4">
          {/* 1. Streak */}
          <section aria-label="Reading streak">
            <StreakStat streak={view.streak} />
          </section>

          {/* 2. Activity heatmap */}
          <section aria-label="Reading activity heatmap">
            <ActivityHeatmap cells={view.heatmap.cells} />
          </section>

          {/* 3. Totals + speed */}
          <section aria-label="Reading totals">
            <TotalsStat totals={view.totals} speed={view.speed} />
          </section>

          {/* 4. Time of day */}
          <section aria-label="Time of day patterns">
            <TimeOfDayStat timeOfDay={view.timeOfDay} />
          </section>

          {/* 5. Books */}
          <section aria-label="Book progress">
            <BookProgressList books={view.books} />
          </section>
        </div>
      )}
      </div>
    </div>
  );
}
