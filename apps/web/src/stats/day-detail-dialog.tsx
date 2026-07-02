/**
 * day-detail-dialog.tsx — what you read on one calendar day.
 *
 * Opened by clicking an ember on the Activity calendar. Shows the day's total
 * engaged time, sessions and pages, then a per-book breakdown ordered by time
 * spent. Pure presentation — every value is precomputed in present-stats
 * (invariant #1: no fake numbers, no clock read here).
 *
 * Token-only styling (invariant #6).
 */

import { Flame } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';

import type { CalendarDay } from './present-stats.js';

// ── Date formatting ──────────────────────────────────────────────────────────────

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** '2026-06-12' → 'Friday, 12 June 2026'. Parsed as UTC so the date never drifts. */
function formatFullDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const weekday = WEEKDAYS[d.getUTCDay()] ?? '';
  const month = MONTHS[d.getUTCMonth()] ?? '';
  return `${weekday}, ${d.getUTCDate().toString()} ${month} ${d.getUTCFullYear().toString()}`;
}

function plural(n: number, word: string): string {
  return `${n.toString()} ${word}${n === 1 ? '' : 's'}`;
}

// ── Component ──────────────────────────────────────────────────────────────────

interface DayDetailDialogProps {
  day: CalendarDay | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DayDetailDialog({ day, open, onOpenChange }: DayDetailDialogProps) {
  if (day === null) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif text-xl leading-snug text-balance">
            <Flame
              className="size-5 shrink-0 text-streak-lit"
              style={{ filter: 'drop-shadow(0 0 6px var(--color-streak-lit))' }}
              aria-hidden="true"
            />
            {formatFullDay(day.day)}
          </DialogTitle>
          <DialogDescription className="font-sans text-sm text-text-muted">
            {day.activeLabel} read
            <span className="mx-1.5 opacity-40">·</span>
            {plural(day.sessionCount, 'session')}
            <span className="mx-1.5 opacity-40">·</span>
            {plural(day.pagesTurned, 'page')}
          </DialogDescription>
        </DialogHeader>

        {/* Per-book breakdown */}
        <ul className="flex flex-col divide-y divide-line">
          {day.books.map((book) => (
            <li key={book.docId} className="flex items-baseline justify-between gap-4 py-2.5">
              <span className="min-w-0 flex-1 truncate font-serif text-sm text-text">
                {book.title}
              </span>
              <span className="shrink-0 font-sans text-xs tabular-nums text-text-muted">
                {book.activeLabel}
                <span className="mx-1.5 opacity-40">·</span>
                {plural(book.pages, 'page')}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
