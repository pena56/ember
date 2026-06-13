/**
 * totals-stat.tsx — four reading totals + reading speed.
 *
 * 2×2 grid: active time, pages turned, days read, sessions.
 * Fraunces numerals (hero), Inter labels (muted).
 * Reading speed as a quiet secondary line below.
 * Token-only styling (invariant #6).
 */

import { StatCard } from './stat-card.js';

// ── Props ──────────────────────────────────────────────────────────────────────

interface TotalsStatProps {
  totals: {
    activeLabel: string;
    pagesLabel: string;
    daysReadLabel: string;
    sessionsLabel: string;
  };
  speed: {
    pagesPerHourLabel: string;
  };
}

// ── Stat item ──────────────────────────────────────────────────────────────────

function StatItem({ value, label }: { value: string; label: string }) {
  // Split value into numeric and unit parts for Fraunces rendering
  const match = /^(\d[\d,.]*)(.*)$/.exec(value.trim());
  const numeric = match?.[1] ?? value;
  const unit = match?.[2]?.trim() ?? '';

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline gap-1">
        <span className="font-serif text-2xl font-semibold text-text leading-none tabular-nums">
          {numeric}
        </span>
        {unit && (
          <span className="font-sans text-xs text-text-muted leading-none">
            {unit}
          </span>
        )}
      </div>
      <span className="font-sans text-xs text-text-muted leading-snug uppercase tracking-[0.08em]">
        {label}
      </span>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export function TotalsStat({ totals, speed }: TotalsStatProps) {
  return (
    <StatCard title="Reading totals">
      {/* 2×2 grid of totals */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-5">
        <StatItem value={totals.activeLabel} label="Active time" />
        <StatItem value={totals.pagesLabel} label="Pages turned" />
        <StatItem value={totals.daysReadLabel} label="Days read" />
        <StatItem value={totals.sessionsLabel} label="Sessions" />
      </div>

      {/* Reading speed — quiet separator + secondary line */}
      <div className="mt-5 pt-4 border-t border-line">
        <div className="flex items-center justify-between gap-4">
          <span className="font-sans text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
            Reading speed
          </span>
          <span className="font-serif text-base font-semibold text-text tabular-nums">
            {speed.pagesPerHourLabel}
          </span>
        </div>
      </div>
    </StatCard>
  );
}
