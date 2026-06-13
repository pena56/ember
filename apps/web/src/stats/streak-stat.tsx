/**
 * streak-stat.tsx — Stats tab streak section.
 *
 * Calmer than the Today habit header — no goal ring, no flame animation.
 * Fraunces hero numeral for the current streak count; Inter for labels.
 * Status-aware sublabel in warm, non-guilt voice.
 * Token-only styling (invariant #6).
 */

import type { StreakStatus } from '@ember/core';

import { StatCard } from './stat-card.js';

// ── Props ──────────────────────────────────────────────────────────────────────

interface StreakStatProps {
  streak: {
    currentLabel: string;
    longestLabel: string;
    status: StreakStatus;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function statusSublabel(status: StreakStatus, currentLabel: string): string {
  if (currentLabel === 'No streak yet') return 'A few minutes is all it takes.';
  if (status === 'lit') return 'Your ember is lit today.';
  if (status === 'at-risk') return 'Read today to keep it going.';
  return 'Your ember is resting — pick it back up.';
}

function currentColorClass(status: StreakStatus, noStreak: boolean): string {
  if (noStreak) return 'text-text-muted';
  if (status === 'lit') return 'text-streak-lit';
  if (status === 'at-risk') return 'text-streak-risk';
  return 'text-text-muted';
}

// ── Component ──────────────────────────────────────────────────────────────────

export function StreakStat({ streak }: StreakStatProps) {
  const { currentLabel, longestLabel, status } = streak;
  const noStreak = currentLabel === 'No streak yet';
  const colorClass = currentColorClass(status, noStreak);
  const sublabel = statusSublabel(status, currentLabel);

  // Extract numeric portion for Fraunces hero
  const numericMatch = /^(\d+)/.exec(currentLabel);
  const heroNumber = numericMatch ? numericMatch[1] : null;
  const heroUnit = heroNumber ? currentLabel.slice(heroNumber.length) : null;

  return (
    <StatCard title="Streak">
      <div className="flex items-end justify-between gap-4">
        {/* Current streak */}
        <div className="flex flex-col gap-1 min-w-0">
          {heroNumber ? (
            <div className={`flex items-baseline gap-1.5 ${colorClass}`}>
              <span
                className="font-serif text-5xl font-semibold leading-none tabular-nums"
                style={
                  status === 'lit'
                    ? { filter: 'drop-shadow(0 0 12px var(--color-streak-lit))' }
                    : undefined
                }
              >
                {heroNumber}
              </span>
              <span className="font-sans text-sm font-medium text-text-muted leading-none mb-0.5">
                {heroUnit?.trim()}
              </span>
            </div>
          ) : (
            <span className="font-sans text-base font-medium text-text-muted leading-snug">
              {currentLabel}
            </span>
          )}
          <p className="font-sans text-xs text-text-muted leading-snug max-w-[18rem]">
            {sublabel}
          </p>
        </div>

        {/* Longest streak — quiet secondary stat */}
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.1em] text-text-muted">
            Best
          </span>
          <span className="font-serif text-xl font-semibold text-text leading-none tabular-nums">
            {longestLabel.replace('Best: ', '')}
          </span>
        </div>
      </div>
    </StatCard>
  );
}
