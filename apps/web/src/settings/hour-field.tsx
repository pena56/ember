/**
 * hour-field.tsx — bespoke hour stepper for the quiet-hours picker (web).
 *
 * Web analog of mobile's HourField. Renders a labelled group with − / + buttons
 * that step a whole-hour value in [0, 24]. Uses the existing shadcn Button
 * (ghost/outline) — no new Radix dep.
 *
 * Design constraints:
 *  - Token-only styling — no hardcoded colors (invariant #6).
 *  - Re-themes with light/dark automatically via semantic token classes.
 *  - a11y: `role="group"` / `aria-label` on the wrapper; "earlier" / "later"
 *    `aria-label` on the buttons; the formatted value is the visible text and
 *    announced naturally. The − button self-disables at 0; + at 24.
 */

import { useCallback } from 'react';

import { Button } from '@/components/ui/button.js';

import { formatHour } from './format-hour.js';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface HourFieldProps {
  /** Short label shown above the stepper (e.g. "From", "To"). */
  label: string;
  /** Current hour value: whole integer in [0, 24]. */
  hour: number;
  /** Called with the new integer value when the user steps up or down. */
  onChange: (hour: number) => void;
  /** When true, both buttons are disabled. */
  disabled?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function HourField({ label, hour, onChange, disabled = false }: HourFieldProps) {
  const decrement = useCallback(() => {
    onChange(Math.max(0, hour - 1));
  }, [hour, onChange]);

  const increment = useCallback(() => {
    onChange(Math.min(24, hour + 1));
  }, [hour, onChange]);

  const formatted = formatHour(hour);

  return (
    // The group gets the label so AT announces "From: stepper group" or similar.
    <div role="group" aria-label={label} className="flex flex-col gap-2">
      {/* Label — uppercase caption matching the section-header style */}
      <span className="font-sans text-xs font-medium uppercase tracking-widest text-text-muted">
        {label}
      </span>

      {/* Stepper row: [ − ]  value  [ + ] */}
      <div className="flex items-center gap-2">
        {/* Decrement button — self-disables at 0 */}
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="earlier"
          onClick={decrement}
          disabled={disabled || hour <= 0}
          className="rounded-full border-line bg-surface text-text-muted hover:bg-surface-raised hover:text-text focus-visible:ring-accent dark:border-line dark:bg-surface dark:hover:bg-surface-raised"
        >
          <span aria-hidden="true" className="text-base leading-none select-none">−</span>
        </Button>

        {/* Value display — serif for the warm Ember feel, wide enough for "12:00 AM" */}
        <span
          className="font-serif text-sm text-text text-center tabular-nums"
          style={{ minWidth: '5.5rem' }}
          aria-live="polite"
          aria-atomic="true"
        >
          {formatted}
        </span>

        {/* Increment button — self-disables at 24 */}
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="later"
          onClick={increment}
          disabled={disabled || hour >= 24}
          className="rounded-full border-line bg-surface text-text-muted hover:bg-surface-raised hover:text-text focus-visible:ring-accent dark:border-line dark:bg-surface dark:hover:bg-surface-raised"
        >
          <span aria-hidden="true" className="text-base leading-none select-none">+</span>
        </Button>
      </div>
    </div>
  );
}
