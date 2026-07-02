/**
 * activity-calendar.tsx — a month calendar where reading days burn.
 *
 * Replaces the GitHub-style heatmap: each day that had reading activity shows a
 * live ember whose size + glow scale with time spent (levels 1–4, shared with
 * the heatmap binning in present-stats). Tapping an ember opens the day's
 * breakdown (DayDetailDialog). Month navigation is clamped to the data window
 * [fromDay, toDay] so you can never page into an empty future.
 *
 * Token-only styling (invariant #6). No fake numbers — every ember is a real day.
 */

import { ChevronLeft, ChevronRight, Flame } from 'lucide-react';
import { useMemo, useState } from 'react';

import { cn } from '@/lib/utils.js';

import { DayDetailDialog } from './day-detail-dialog.js';
import type { CalendarDay } from './present-stats.js';
import { StatCard } from './stat-card.js';

// ── Constants ──────────────────────────────────────────────────────────────────

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** Ember visual per intensity level: icon size (px), opacity, glow blur (px), surface tint (%). */
const EMBER: Record<1 | 2 | 3 | 4, { size: number; opacity: number; glow: number; tint: number }> = {
  1: { size: 13, opacity: 0.55, glow: 4, tint: 6 },
  2: { size: 15, opacity: 0.72, glow: 6, tint: 9 },
  3: { size: 17, opacity: 0.86, glow: 9, tint: 12 },
  4: { size: 20, opacity: 1, glow: 13, tint: 16 },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function pad2(n: number): string {
  return n < 10 ? `0${n.toString()}` : n.toString();
}

/** Absolute month index (year*12 + month0) for ordering / clamping. */
function monthIndex(year: number, month0: number): number {
  return year * 12 + month0;
}

function parseDay(day: string): { year: number; month0: number } {
  const d = new Date(`${day}T00:00:00Z`);
  return { year: d.getUTCFullYear(), month0: d.getUTCMonth() };
}

function plural(n: number, word: string): string {
  return `${n.toString()} ${word}${n === 1 ? '' : 's'}`;
}

// ── Component ──────────────────────────────────────────────────────────────────

interface ActivityCalendarProps {
  calendar: { fromDay: string; toDay: string; days: CalendarDay[] };
}

export function ActivityCalendar({ calendar }: ActivityCalendarProps) {
  const { fromDay, toDay, days } = calendar;

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarDay>();
    for (const d of days) map.set(d.day, d);
    return map;
  }, [days]);

  const [cursor, setCursor] = useState(() => parseDay(toDay || fromDay));
  const [selected, setSelected] = useState<CalendarDay | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (days.length === 0) {
    return (
      <StatCard title="Activity">
        <p className="font-sans text-sm text-text-muted">
          Your reading days will light up here.
        </p>
      </StatCard>
    );
  }

  const from = parseDay(fromDay);
  const to = parseDay(toDay);
  const cursorIdx = monthIndex(cursor.year, cursor.month0);
  const canPrev = cursorIdx > monthIndex(from.year, from.month0);
  const canNext = cursorIdx < monthIndex(to.year, to.month0);

  function step(delta: number) {
    setCursor((c) => {
      const idx = monthIndex(c.year, c.month0) + delta;
      return { year: Math.floor(idx / 12), month0: ((idx % 12) + 12) % 12 };
    });
  }

  // Build the month grid: leading blanks (Sun-first) then each day-of-month.
  const firstWeekday = new Date(Date.UTC(cursor.year, cursor.month0, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(cursor.year, cursor.month0 + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  function openDay(detail: CalendarDay) {
    setSelected(detail);
    setDialogOpen(true);
  }

  return (
    <StatCard title="Activity">
      {/* Month navigation */}
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => { step(-1); }}
          disabled={!canPrev}
          aria-label="Previous month"
          className="flex size-8 items-center justify-center rounded-sm text-text-muted transition hover:bg-surface hover:text-text disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ChevronLeft className="size-4" />
        </button>
        <h3 className="font-serif text-base font-medium text-text">
          {MONTH_NAMES[cursor.month0]} {cursor.year.toString()}
        </h3>
        <button
          type="button"
          onClick={() => { step(1); }}
          disabled={!canNext}
          aria-label="Next month"
          className="flex size-8 items-center justify-center rounded-sm text-text-muted transition hover:bg-surface hover:text-text disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1.5" aria-hidden="true">
        {WEEKDAY_INITIALS.map((w, i) => (
          <div key={i} className="text-center font-sans text-[10px] font-medium text-text-muted">
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="mt-1.5 grid grid-cols-7 gap-1.5">
        {cells.map((dom, i) => {
          if (dom === null) return <div key={`b${i.toString()}`} aria-hidden="true" />;

          const dayStr = `${cursor.year.toString()}-${pad2(cursor.month0 + 1)}-${pad2(dom)}`;
          const detail = byDay.get(dayStr);
          const isToday = dayStr === toDay;

          if (detail === undefined) {
            return (
              <div
                key={dayStr}
                className={cn(
                  'flex aspect-square items-center justify-center rounded-md',
                  isToday && 'ring-1 ring-accent/40',
                )}
              >
                <span className="font-sans text-xs tabular-nums text-text-muted opacity-60">
                  {dom}
                </span>
              </div>
            );
          }

          const e = EMBER[detail.level];
          return (
            <button
              key={dayStr}
              type="button"
              onClick={() => { openDay(detail); }}
              aria-label={`${dom.toString()} ${MONTH_NAMES[cursor.month0] ?? ''}: ${detail.activeLabel} read across ${plural(detail.sessionCount, 'session')} — view details`}
              className={cn(
                'group relative flex aspect-square items-center justify-center rounded-md transition',
                'hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                isToday && 'ring-1 ring-accent/50',
              )}
              style={{
                backgroundColor: `color-mix(in srgb, var(--color-streak-lit) ${e.tint.toString()}%, transparent)`,
              }}
            >
              <span className="absolute left-1.5 top-1 font-sans text-[10px] tabular-nums text-text-muted">
                {dom}
              </span>
              <Flame
                className="text-streak-lit motion-safe:animate-[ember-flicker_3.2s_ease-in-out_infinite]"
                style={{
                  width: e.size,
                  height: e.size,
                  opacity: e.opacity,
                  filter: `drop-shadow(0 0 ${e.glow.toString()}px var(--color-streak-lit))`,
                  animationDelay: `${((dom % 5) * 0.4).toString()}s`,
                }}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>

      {/* Caption */}
      <p className="mt-4 flex items-center gap-1.5 font-sans text-xs text-text-muted">
        <Flame className="size-3 text-streak-lit" aria-hidden="true" />
        Tap a lit day to see what you read.
      </p>

      <DayDetailDialog day={selected} open={dialogOpen} onOpenChange={setDialogOpen} />
    </StatCard>
  );
}
