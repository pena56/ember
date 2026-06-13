/**
 * time-of-day-stat.tsx — when do you read? 4 proportional bars.
 *
 * morning / afternoon / evening / night as horizontal bars.
 * Bar width = fraction (0..1) × 100%. Accent fill on line track.
 * Duration per part shown at the end of each bar row.
 * Calm empty state when !hasAny.
 * Token-only styling (invariant #6).
 */

import type { DayPart } from '@ember/core';

import { StatCard } from './stat-card.js';

// ── Props ──────────────────────────────────────────────────────────────────────

interface TimeOfDayStatProps {
  timeOfDay: {
    parts: {
      part: DayPart;
      label: string;
      activeMs: number;
      fraction: number;
    }[];
    hasAny: boolean;
  };
}

// ── Day-part display metadata ─────────────────────────────────────────────────

const PART_META: Record<DayPart, { display: string; hours: string }> = {
  morning:   { display: 'Morning',   hours: '5–11 am'  },
  afternoon: { display: 'Afternoon', hours: '12–4 pm'  },
  evening:   { display: 'Evening',   hours: '5–9 pm'   },
  night:     { display: 'Night',     hours: '10 pm–4 am' },
};

// ── Component ──────────────────────────────────────────────────────────────────

export function TimeOfDayStat({ timeOfDay }: TimeOfDayStatProps) {
  return (
    <StatCard title="When you read">
      {!timeOfDay.hasAny ? (
        <p className="font-sans text-sm text-text-muted">
          Your reading patterns will appear here.
        </p>
      ) : (
        <div className="flex flex-col gap-3.5">
          {timeOfDay.parts.map(({ part, label, fraction }) => {
            const meta = PART_META[part];
            const pct = `${(fraction * 100).toFixed(0)}%`;
            return (
              <div key={part} className="flex flex-col gap-1">
                {/* Label row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="font-sans text-xs font-medium text-text w-20">
                      {meta.display}
                    </span>
                    <span className="font-sans text-[10px] text-text-muted">
                      {meta.hours}
                    </span>
                  </div>
                  <span className="font-sans text-xs text-text-muted tabular-nums shrink-0">
                    {label}
                  </span>
                </div>

                {/* Bar track */}
                <div
                  className="relative h-1.5 w-full rounded-full overflow-hidden"
                  style={{ backgroundColor: 'var(--color-line)' }}
                  aria-label={`${meta.display}: ${pct} of reading time (${label})`}
                  role="meter"
                  aria-valuenow={Math.round(fraction * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="absolute inset-y-0 left-0 rounded-full motion-safe:transition-[width] motion-safe:duration-700 motion-safe:ease-out"
                    style={{
                      width: pct,
                      backgroundColor: 'var(--color-accent)',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </StatCard>
  );
}
