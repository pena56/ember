/**
 * goal-ring.tsx — circular progress ring showing today's active minutes vs target.
 *
 * Two concentric SVG circles: track (line token) + progress arc (accent token).
 * Ring fraction is pre-clamped to [0,1] by presentHabit — no clamping here.
 * motion-safe arc transition; role="img" + aria-label for a11y.
 * Token-only styling (invariant #6).
 */

import type { HabitView } from './present-habit.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const RADIUS = 40;
const STROKE_WIDTH = 8;
const SIZE = 100; // viewBox units

// Full circumference of the progress circle
const CIRCUMFERENCE = 2 * Math.PI * RADIUS; // ≈ 251.327

// ── Props ─────────────────────────────────────────────────────────────────────

interface GoalRingProps {
  view: HabitView;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GoalRing({ view }: GoalRingProps) {
  const { ringFraction, goalLabel, goalMet, goalMinutes, targetMinutes } = view;

  const dashOffset = CIRCUMFERENCE * (1 - ringFraction);

  // Accessible label — differentiates met vs in-progress
  const ariaLabel = goalMet
    ? `Today's goal met: ${goalMinutes} of ${targetMinutes} minutes`
    : `Today's goal: ${goalMinutes} of ${targetMinutes} minutes`;

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="relative flex shrink-0 items-center justify-center w-24 h-24"
    >
      {/* SVG ring */}
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width="96"
        height="96"
        aria-hidden="true"
        className="absolute inset-0"
        style={{ overflow: 'visible' }}
      >
        {/* Track circle — uses line token */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
        />

        {/* Progress arc — uses accent token; starts at top via transform */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-700 motion-safe:ease-out"
          style={{ willChange: 'stroke-dashoffset' }}
        />
      </svg>

      {/* Center text overlay — absolute-centered over the SVG */}
      <div
        className="relative z-10 flex flex-col items-center justify-center gap-0.5 text-center"
        aria-hidden="true"
      >
        <span className="font-sans text-[11px] font-semibold text-text leading-none tabular-nums">
          {goalLabel}
        </span>
        {goalMet && (
          <span className="font-sans text-[9px] font-medium text-accent leading-none tracking-wide uppercase">
            Goal met
          </span>
        )}
      </div>
    </div>
  );
}
