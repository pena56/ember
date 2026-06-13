/**
 * streak-ember.tsx — the glowing flame motif for the Today habit header.
 *
 * Status-aware: lit (warm glow), at-risk (muted amber), broken/zero (ash/dim).
 * Freeze pips appear only when freezesBanked > 0.
 * Token-only styling — no hardcoded colors (invariant #6).
 * All motion gated behind motion-safe (invariant a11y).
 */

import type { HabitView } from './present-habit.js';

// ── Props ─────────────────────────────────────────────────────────────────────

interface StreakEmberProps {
  view: HabitView;
}

// ── Snowflake SVG (freeze pips) ───────────────────────────────────────────────

function SnowflakeIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      {/* Vertical bar */}
      <line x1="8" y1="1" x2="8" y2="15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* Horizontal bar */}
      <line x1="1" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* Diagonal TL–BR */}
      <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* Diagonal TR–BL */}
      <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* Top arm ticks */}
      <line x1="5.5" y1="3.5" x2="8" y2="1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="10.5" y1="3.5" x2="8" y2="1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      {/* Bottom arm ticks */}
      <line x1="5.5" y1="12.5" x2="8" y2="15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="10.5" y1="12.5" x2="8" y2="15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StreakEmber({ view }: StreakEmberProps) {
  const { streakCount, streakStatus, streakLabel, streakSublabel, freezesBanked } = view;

  // Token class for the flame color
  const flameColorClass =
    streakStatus === 'lit'
      ? 'text-streak-lit'
      : streakStatus === 'at-risk'
        ? 'text-streak-risk'
        : 'text-text-muted opacity-40';

  // The count label also uses the flame color (when lit/at-risk)
  const countColorClass =
    streakStatus === 'lit'
      ? 'text-streak-lit'
      : streakStatus === 'at-risk'
        ? 'text-streak-risk'
        : 'text-text-muted';

  // Build a meaningful aria-label
  const ariaLabel =
    streakCount > 0
      ? `${streakCount} ${streakCount === 1 ? 'day' : 'days'} reading streak, ${streakSublabel.toLowerCase()}`
      : `Start your streak — ${streakSublabel.toLowerCase()}`;

  return (
    <div
      className="flex items-start gap-3"
      aria-label={ariaLabel}
      role="region"
    >
      {/* Flame + glow container */}
      <div className="relative flex shrink-0 items-center justify-center">
        {/* Soft radial glow — only when lit */}
        {streakStatus === 'lit' && (
          <div
            className="absolute inset-0 -m-3 rounded-full bg-streak-lit opacity-20 blur-md motion-safe:animate-pulse"
            aria-hidden="true"
          />
        )}

        {/* Flame SVG — exact paths from continue-reading-card.tsx for motif parity */}
        <svg
          width="44"
          height="52"
          viewBox="0 0 44 56"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          className={`relative z-10 ${flameColorClass}`}
          style={
            streakStatus === 'lit'
              ? { filter: 'drop-shadow(0 0 8px var(--color-streak-lit))' }
              : undefined
          }
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
      </div>

      {/* Text stack */}
      <div className="flex flex-col gap-0.5 pt-1 min-w-0">
        {/* Streak count — Fraunces, large, only when > 0 */}
        {streakCount > 0 && (
          <span
            className={`font-serif text-3xl font-semibold leading-none ${countColorClass}`}
          >
            {streakCount}
          </span>
        )}

        {/* Streak label — "3 days" / "Start your streak" */}
        <span
          className={`font-sans text-sm font-medium leading-snug ${
            streakCount > 0 ? 'text-text' : 'text-text-muted'
          }`}
        >
          {streakLabel}
        </span>

        {/* Sublabel — warm, status-aware copy */}
        <span className="font-sans text-xs text-text-muted leading-snug">
          {streakSublabel}
        </span>

        {/* Freeze pips — only when banked > 0 */}
        {freezesBanked > 0 && (
          <div className="flex items-center gap-1 mt-1">
            <div className="flex items-center gap-1 rounded-full bg-line px-2 py-0.5">
              <span className="text-text-muted">
                <SnowflakeIcon />
              </span>
              <span className="font-sans text-xs text-text-muted font-medium">
                {freezesBanked}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
