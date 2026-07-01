/**
 * format-hour.ts — pure 12-hour display helper for the quiet-hours picker.
 *
 * Extracted from hour-field.tsx so it can be unit-tested in the node vitest
 * environment without pulling in any DOM or React dependencies.
 *
 * No platform dependencies; safe to import in tests. Mirrors mobile's
 * format-hour.ts (small intentional duplication — no cross-package refactor
 * in this slice, per 17e spec).
 */

/**
 * Format a whole 0–24 hour integer as a compact 12-hour display string.
 *
 * - 0  → "12:00 AM"
 * - 12 → "12:00 PM"
 * - 24 → "Midnight"
 * - other hours → "N:00 AM" / "N:00 PM"
 *
 * The stored/emitted value is always the integer; this is display-only.
 */
export function formatHour(hour: number): string {
  if (hour === 0) return '12:00 AM';
  if (hour === 24) return 'Midnight';
  if (hour < 12) return `${hour}:00 AM`;
  if (hour === 12) return '12:00 PM';
  return `${hour - 12}:00 PM`;
}
