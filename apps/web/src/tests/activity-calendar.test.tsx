/**
 * activity-calendar.test.tsx — the Stats month calendar + day-detail dialog.
 *
 *  (1) renders the toDay month with an ember for the active day.
 *  (2) clicking an ember opens the day's breakdown (book title + summary).
 *  (3) empty days → warm "light up here" copy, no crash.
 *  (4) month navigation is clamped to the [fromDay, toDay] window.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ActivityCalendar } from '../stats/activity-calendar.js';
import type { CalendarDay } from '../stats/present-stats.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────────

function makeDay(day: string, overrides: Partial<CalendarDay> = {}): CalendarDay {
  return {
    day,
    level: 3,
    activeMs: 30 * 60_000,
    activeLabel: '30m',
    sessionCount: 2,
    pagesTurned: 5,
    books: [
      { docId: 'doc-1', title: 'The Dawn of Everything', activeMs: 30 * 60_000, activeLabel: '30m', pages: 5 },
    ],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ActivityCalendar', () => {
  afterEach(() => {
    cleanup();
  });

  it('(1) shows the toDay month with an ember for the active day', () => {
    render(
      <ActivityCalendar
        calendar={{ fromDay: '2026-06-01', toDay: '2026-06-30', days: [makeDay('2026-06-13')] }}
      />,
    );

    expect(screen.getByText('June 2026')).toBeDefined();
    const ember = screen.getByRole('button', { name: /13 June/i });
    expect(ember).toBeDefined();
    expect(ember.getAttribute('aria-label')).toContain('view details');
  });

  it('(2) clicking an ember opens the day breakdown', () => {
    render(
      <ActivityCalendar
        calendar={{ fromDay: '2026-06-01', toDay: '2026-06-30', days: [makeDay('2026-06-13')] }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /13 June/i }));

    // Dialog content (portal) — book title + a summary line
    expect(screen.getByText('The Dawn of Everything')).toBeDefined();
    expect(screen.getByText(/2 sessions/i)).toBeDefined();
  });

  it('(3) no active days → warm empty copy, no ember buttons', () => {
    render(<ActivityCalendar calendar={{ fromDay: '', toDay: '', days: [] }} />);

    expect(screen.getByText(/light up here/i)).toBeDefined();
    expect(screen.queryByText('June 2026')).toBeNull();
  });

  it('(4) navigation clamps to the data window', () => {
    render(
      <ActivityCalendar
        calendar={{ fromDay: '2026-05-01', toDay: '2026-06-30', days: [makeDay('2026-06-13')] }}
      />,
    );

    // At toDay's month: next is disabled (no future), prev is enabled.
    const next = screen.getByRole('button', { name: 'Next month' }) as HTMLButtonElement;
    const prev = screen.getByRole('button', { name: 'Previous month' }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    expect(prev.disabled).toBe(false);

    // Step back to the window's first month → prev now disabled.
    fireEvent.click(prev);
    expect(screen.getByText('May 2026')).toBeDefined();
    expect((screen.getByRole('button', { name: 'Previous month' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Next month' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
