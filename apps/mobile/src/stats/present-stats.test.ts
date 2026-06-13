/**
 * present-stats.test.ts — pure unit tests for presentStats().
 * No DOM, no React, no Date — just input fixtures → StatsView assertions.
 *
 * Mirrors present-habit.test.ts structure.
 */

import { describe, expect, it } from 'vitest';

import type {
  AnalyticsSummary,
  BookProgress,
  Document,
  HabitSummary,
  HeatmapCell,
  ReadingSession,
} from '@ember/core';
import { DEFAULT_GOAL_ACTIVE_MS } from '@ember/core';

import type { PresentStatsInput, StatsView } from './present-stats.js';
import { presentStats } from './present-stats.js';

// ── Fixture helpers ────────────────────────────────────────────────────────────

function makeHabit(overrides: Partial<{
  current: number;
  longest: number;
  status: 'lit' | 'at-risk' | 'broken';
}>): HabitSummary {
  return {
    streak: {
      current: overrides.current ?? 0,
      longest: overrides.longest ?? 0,
      freezesBanked: 0,
      lastReadDay: null,
      status: overrides.status ?? 'broken',
    },
    goal: {
      targetActiveMs: DEFAULT_GOAL_ACTIVE_MS,
      activeMs: 0,
      ratio: 0,
      met: false,
    },
  };
}

function makeAnalytics(overrides: Partial<{
  activeMs: number;
  pagesTurned: number;
  daysRead: number;
  sessions: number;
  pagesPerHour: number | null;
  timeOfDay: { morning: number; afternoon: number; evening: number; night: number };
  books: BookProgress[];
}>): AnalyticsSummary {
  return {
    totals: {
      activeMs: overrides.activeMs ?? 0,
      pagesTurned: overrides.pagesTurned ?? 0,
      daysRead: overrides.daysRead ?? 0,
      sessions: overrides.sessions ?? 0,
    },
    speed: {
      pagesPerHour: overrides.pagesPerHour !== undefined ? overrides.pagesPerHour : null,
      msPerPage: null,
    },
    timeOfDay: overrides.timeOfDay ?? { morning: 0, afternoon: 0, evening: 0, night: 0 },
    books: overrides.books ?? [],
  };
}

function makeSession(docId: string, endedAt: number, localDay: string): ReadingSession {
  return {
    id: `s-${docId}-${endedAt.toString()}`,
    docId,
    localDay,
    tzOffsetMinutes: 0,
    startedAt: endedAt - 1000,
    endedAt,
    activeMs: 1000,
    pages: [1],
    updatedAt: '',
  };
}

function makeDoc(id: string, title: string, pageCount?: number): Document {
  const doc: Document = {
    id,
    title,
    filename: `${title}.pdf`,
    byteSize: 1000,
    contentType: 'application/pdf',
    importedAt: 0,
  };
  if (pageCount !== undefined) doc.pageCount = pageCount;
  return doc;
}

function makeHeatmap(entries: { day: string; activeMs: number }[]): HeatmapCell[] {
  return entries.map(({ day, activeMs }) => ({ day, activeMs, sessions: activeMs > 0 ? 1 : 0 }));
}

const EMPTY_INPUT: PresentStatsInput = {
  habit: makeHabit({}),
  analytics: makeAnalytics({}),
  heatmap: [],
  docs: [],
  sessions: [],
};

// ── 1. Duration formatting ─────────────────────────────────────────────────────

describe('presentStats — duration formatting via totals.activeLabel', () => {
  it('0ms → "0m"', () => {
    const view = presentStats({ ...EMPTY_INPUT, analytics: makeAnalytics({ activeMs: 0 }) });
    expect(view.totals.activeLabel).toBe('0m');
  });

  it('45 minutes → "45m"', () => {
    const view = presentStats({ ...EMPTY_INPUT, analytics: makeAnalytics({ activeMs: 45 * 60_000 }) });
    expect(view.totals.activeLabel).toBe('45m');
  });

  it('exactly 2 hours → "2h" (no trailing 0m)', () => {
    const view = presentStats({ ...EMPTY_INPUT, analytics: makeAnalytics({ activeMs: 2 * 3_600_000 }) });
    expect(view.totals.activeLabel).toBe('2h');
  });

  it('2h 5m → "2h 5m"', () => {
    const ms = 2 * 3_600_000 + 5 * 60_000;
    const view = presentStats({ ...EMPTY_INPUT, analytics: makeAnalytics({ activeMs: ms }) });
    expect(view.totals.activeLabel).toBe('2h 5m');
  });

  it('1h 30m → "1h 30m"', () => {
    const ms = 1 * 3_600_000 + 30 * 60_000;
    const view = presentStats({ ...EMPTY_INPUT, analytics: makeAnalytics({ activeMs: ms }) });
    expect(view.totals.activeLabel).toBe('1h 30m');
  });
});

// ── 2. ETA label ───────────────────────────────────────────────────────────────

describe('presentStats — ETA label', () => {
  const docId = 'doc-1';
  const doc = makeDoc(docId, 'Test Book', 100);

  it('etaMs null → etaLabel null', () => {
    const books: BookProgress[] = [{
      docId,
      pageCount: 100,
      furthestPage: 50,
      progressRatio: 0.5,
      pagesRemaining: 50,
      etaMs: null,
    }];
    const view = presentStats({
      ...EMPTY_INPUT,
      analytics: makeAnalytics({ books }),
      docs: [doc],
      sessions: [makeSession(docId, 1000, '2026-01-01')],
    });
    expect(view.books[0]?.etaLabel).toBeNull();
  });

  it('pagesRemaining 0 → "Finished"', () => {
    const books: BookProgress[] = [{
      docId,
      pageCount: 100,
      furthestPage: 100,
      progressRatio: 1,
      pagesRemaining: 0,
      etaMs: 0,
    }];
    const view = presentStats({
      ...EMPTY_INPUT,
      analytics: makeAnalytics({ books }),
      docs: [doc],
      sessions: [makeSession(docId, 1000, '2026-01-01')],
    });
    expect(view.books[0]?.etaLabel).toBe('Finished');
  });

  it('etaMs > 0 → "~Xh Ym left"', () => {
    const books: BookProgress[] = [{
      docId,
      pageCount: 100,
      furthestPage: 50,
      progressRatio: 0.5,
      pagesRemaining: 50,
      etaMs: 2 * 3_600_000 + 5 * 60_000, // 2h 5m
    }];
    const view = presentStats({
      ...EMPTY_INPUT,
      analytics: makeAnalytics({ books }),
      docs: [doc],
      sessions: [makeSession(docId, 1000, '2026-01-01')],
    });
    expect(view.books[0]?.etaLabel).toBe('~2h 5m left');
  });

  it('etaMs = 45 minutes → "~45m left"', () => {
    const books: BookProgress[] = [{
      docId,
      pageCount: 100,
      furthestPage: 50,
      progressRatio: 0.5,
      pagesRemaining: 50,
      etaMs: 45 * 60_000,
    }];
    const view = presentStats({
      ...EMPTY_INPUT,
      analytics: makeAnalytics({ books }),
      docs: [doc],
      sessions: [makeSession(docId, 1000, '2026-01-01')],
    });
    expect(view.books[0]?.etaLabel).toBe('~45m left');
  });
});

// ── 3. Progress label ──────────────────────────────────────────────────────────

describe('presentStats — progress label', () => {
  const docId = 'doc-1';
  const doc = makeDoc(docId, 'Test Book', 100);

  it('progressRatio null → progressLabel null', () => {
    const books: BookProgress[] = [{
      docId,
      pageCount: null,
      furthestPage: 0,
      progressRatio: null,
      pagesRemaining: null,
      etaMs: null,
    }];
    const view = presentStats({
      ...EMPTY_INPUT,
      analytics: makeAnalytics({ books }),
      docs: [doc],
      sessions: [makeSession(docId, 1000, '2026-01-01')],
    });
    expect(view.books[0]?.progressLabel).toBeNull();
  });

  it('progressRatio 0 → "0%"', () => {
    const books: BookProgress[] = [{
      docId,
      pageCount: 100,
      furthestPage: 0,
      progressRatio: 0,
      pagesRemaining: 100,
      etaMs: null,
    }];
    const view = presentStats({
      ...EMPTY_INPUT,
      analytics: makeAnalytics({ books }),
      docs: [doc],
      sessions: [makeSession(docId, 1000, '2026-01-01')],
    });
    expect(view.books[0]?.progressLabel).toBe('0%');
  });

  it('progressRatio 0.64 → "64%"', () => {
    const books: BookProgress[] = [{
      docId,
      pageCount: 100,
      furthestPage: 64,
      progressRatio: 0.64,
      pagesRemaining: 36,
      etaMs: null,
    }];
    const view = presentStats({
      ...EMPTY_INPUT,
      analytics: makeAnalytics({ books }),
      docs: [doc],
      sessions: [makeSession(docId, 1000, '2026-01-01')],
    });
    expect(view.books[0]?.progressLabel).toBe('64%');
  });

  it('progressRatio 1 → "100%"', () => {
    const books: BookProgress[] = [{
      docId,
      pageCount: 100,
      furthestPage: 100,
      progressRatio: 1,
      pagesRemaining: 0,
      etaMs: 0,
    }];
    const view = presentStats({
      ...EMPTY_INPUT,
      analytics: makeAnalytics({ books }),
      docs: [doc],
      sessions: [makeSession(docId, 1000, '2026-01-01')],
    });
    expect(view.books[0]?.progressLabel).toBe('100%');
  });
});

// ── 4. Heatmap level binning ───────────────────────────────────────────────────

describe('presentStats — heatmap level binning', () => {
  it('all-zero heatmap → all level 0', () => {
    const heatmap = makeHeatmap([
      { day: '2026-01-01', activeMs: 0 },
      { day: '2026-01-02', activeMs: 0 },
    ]);
    const view = presentStats({ ...EMPTY_INPUT, heatmap });
    expect(view.heatmap.cells.every(c => c.level === 0)).toBe(true);
    expect(view.heatmap.maxActiveMs).toBe(0);
  });

  it('max cell maps to level 4', () => {
    const heatmap = makeHeatmap([
      { day: '2026-01-01', activeMs: 3_600_000 }, // max
      { day: '2026-01-02', activeMs: 0 },
    ]);
    const view = presentStats({ ...EMPTY_INPUT, heatmap });
    const maxCell = view.heatmap.cells.find(c => c.day === '2026-01-01');
    expect(maxCell?.level).toBe(4);
    expect(view.heatmap.maxActiveMs).toBe(3_600_000);
  });

  it('mid values binned to expected quartile (50% → level 2)', () => {
    const maxMs = 3_600_000;
    const halfMs = maxMs / 2;
    const heatmap = makeHeatmap([
      { day: '2026-01-01', activeMs: maxMs },
      { day: '2026-01-02', activeMs: halfMs },
    ]);
    const view = presentStats({ ...EMPTY_INPUT, heatmap });
    const halfCell = view.heatmap.cells.find(c => c.day === '2026-01-02');
    // ceil(0.5 * 4) = 2
    expect(halfCell?.level).toBe(2);
  });

  it('small non-zero value → at least level 1', () => {
    const heatmap = makeHeatmap([
      { day: '2026-01-01', activeMs: 3_600_000 },
      { day: '2026-01-02', activeMs: 1 }, // tiny non-zero
    ]);
    const view = presentStats({ ...EMPTY_INPUT, heatmap });
    const tinyCell = view.heatmap.cells.find(c => c.day === '2026-01-02');
    expect(tinyCell?.level).toBeGreaterThanOrEqual(1);
  });

  it('cell label format: "<day>: <duration>"', () => {
    const heatmap = makeHeatmap([
      { day: '2026-06-13', activeMs: 18 * 60_000 },
    ]);
    const view = presentStats({ ...EMPTY_INPUT, heatmap });
    expect(view.heatmap.cells[0]?.label).toBe('2026-06-13: 18m');
  });

  it('zero activeMs cell label shows "0m"', () => {
    const heatmap = makeHeatmap([
      { day: '2026-06-13', activeMs: 0 },
    ]);
    const view = presentStats({ ...EMPTY_INPUT, heatmap });
    expect(view.heatmap.cells[0]?.label).toBe('2026-06-13: 0m');
  });
});

// ── 5. Totals + speed labels ───────────────────────────────────────────────────

describe('presentStats — totals labels', () => {
  it('pagesLabel pluralizes: 1 page', () => {
    const view = presentStats({
      ...EMPTY_INPUT,
      analytics: makeAnalytics({ pagesTurned: 1 }),
    });
    expect(view.totals.pagesLabel).toBe('1 page');
  });

  it('pagesLabel pluralizes: 318 pages', () => {
    const view = presentStats({
      ...EMPTY_INPUT,
      analytics: makeAnalytics({ pagesTurned: 318 }),
    });
    expect(view.totals.pagesLabel).toBe('318 pages');
  });

  it('daysReadLabel pluralizes: 1 day', () => {
    const view = presentStats({
      ...EMPTY_INPUT,
      analytics: makeAnalytics({ daysRead: 1 }),
    });
    expect(view.totals.daysReadLabel).toBe('1 day');
  });

  it('daysReadLabel pluralizes: 9 days', () => {
    const view = presentStats({
      ...EMPTY_INPUT,
      analytics: makeAnalytics({ daysRead: 9 }),
    });
    expect(view.totals.daysReadLabel).toBe('9 days');
  });

  it('sessionsLabel pluralizes: 1 session', () => {
    const view = presentStats({
      ...EMPTY_INPUT,
      analytics: makeAnalytics({ sessions: 1 }),
    });
    expect(view.totals.sessionsLabel).toBe('1 session');
  });

  it('sessionsLabel pluralizes: 14 sessions', () => {
    const view = presentStats({
      ...EMPTY_INPUT,
      analytics: makeAnalytics({ sessions: 14 }),
    });
    expect(view.totals.sessionsLabel).toBe('14 sessions');
  });
});

describe('presentStats — speed label', () => {
  it('null pagesPerHour → "—"', () => {
    const view = presentStats({ ...EMPTY_INPUT, analytics: makeAnalytics({ pagesPerHour: null }) });
    expect(view.speed.pagesPerHourLabel).toBe('—');
  });

  it('27 pagesPerHour → "27 pages/hour"', () => {
    const view = presentStats({ ...EMPTY_INPUT, analytics: makeAnalytics({ pagesPerHour: 27 }) });
    expect(view.speed.pagesPerHourLabel).toBe('27 pages/hour');
  });

  it('fractional pagesPerHour → rounded to integer', () => {
    const view = presentStats({ ...EMPTY_INPUT, analytics: makeAnalytics({ pagesPerHour: 12.7 }) });
    expect(view.speed.pagesPerHourLabel).toBe('13 pages/hour');
  });
});

// ── 6. Time-of-day ─────────────────────────────────────────────────────────────

describe('presentStats — time-of-day', () => {
  it('fixed 4-part order: morning, afternoon, evening, night', () => {
    const view = presentStats({ ...EMPTY_INPUT });
    const parts = view.timeOfDay.parts.map(p => p.part);
    expect(parts).toEqual(['morning', 'afternoon', 'evening', 'night']);
  });

  it('all-zero → hasAny false', () => {
    const view = presentStats({ ...EMPTY_INPUT });
    expect(view.timeOfDay.hasAny).toBe(false);
  });

  it('non-zero values → hasAny true', () => {
    const view = presentStats({
      ...EMPTY_INPUT,
      analytics: makeAnalytics({ timeOfDay: { morning: 1_000, afternoon: 0, evening: 0, night: 0 } }),
    });
    expect(view.timeOfDay.hasAny).toBe(true);
  });

  it('fractions sum to ~1 when total > 0', () => {
    const view = presentStats({
      ...EMPTY_INPUT,
      analytics: makeAnalytics({
        timeOfDay: { morning: 1_000, afternoon: 2_000, evening: 3_000, night: 4_000 },
      }),
    });
    const sum = view.timeOfDay.parts.reduce((acc, p) => acc + p.fraction, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it('each part label matches formatted activeMs', () => {
    const view = presentStats({
      ...EMPTY_INPUT,
      analytics: makeAnalytics({
        timeOfDay: { morning: 45 * 60_000, afternoon: 0, evening: 0, night: 0 },
      }),
    });
    const morning = view.timeOfDay.parts.find(p => p.part === 'morning');
    expect(morning?.label).toBe('45m');
  });
});

// ── 7. Book ordering / join / drop ─────────────────────────────────────────────

describe('presentStats — book ordering and join', () => {
  const doc1 = makeDoc('doc-1', 'Book One', 100);
  const doc2 = makeDoc('doc-2', 'Book Two', 200);
  const doc3 = makeDoc('doc-3', 'No Sessions Book', 100);

  it('titles joined from docs array', () => {
    const books: BookProgress[] = [
      { docId: 'doc-1', pageCount: 100, furthestPage: 50, progressRatio: 0.5, pagesRemaining: 50, etaMs: null },
    ];
    const sessions = [makeSession('doc-1', 1000, '2026-01-01')];
    const view = presentStats({
      ...EMPTY_INPUT,
      analytics: makeAnalytics({ books }),
      docs: [doc1],
      sessions,
    });
    expect(view.books[0]?.title).toBe('Book One');
  });

  it('books with no sessions are dropped', () => {
    const books: BookProgress[] = [
      { docId: 'doc-1', pageCount: 100, furthestPage: 50, progressRatio: 0.5, pagesRemaining: 50, etaMs: null },
      { docId: 'doc-3', pageCount: 100, furthestPage: 0, progressRatio: 0, pagesRemaining: 100, etaMs: null },
    ];
    const sessions = [makeSession('doc-1', 1000, '2026-01-01')];
    const view = presentStats({
      ...EMPTY_INPUT,
      analytics: makeAnalytics({ books }),
      docs: [doc1, doc3],
      sessions,
    });
    expect(view.books).toHaveLength(1);
    expect(view.books[0]?.docId).toBe('doc-1');
  });

  it('remaining sorted by most-recent endedAt desc', () => {
    const books: BookProgress[] = [
      { docId: 'doc-1', pageCount: 100, furthestPage: 50, progressRatio: 0.5, pagesRemaining: 50, etaMs: null },
      { docId: 'doc-2', pageCount: 200, furthestPage: 100, progressRatio: 0.5, pagesRemaining: 100, etaMs: null },
    ];
    // doc-2's session is more recent
    const sessions = [
      makeSession('doc-1', 1000, '2026-01-01'),
      makeSession('doc-2', 5000, '2026-01-02'), // more recent
    ];
    const view = presentStats({
      ...EMPTY_INPUT,
      analytics: makeAnalytics({ books }),
      docs: [doc1, doc2],
      sessions,
    });
    expect(view.books[0]?.docId).toBe('doc-2');
    expect(view.books[1]?.docId).toBe('doc-1');
  });

  it('finished book → etaLabel "Finished"', () => {
    const books: BookProgress[] = [
      { docId: 'doc-1', pageCount: 100, furthestPage: 100, progressRatio: 1, pagesRemaining: 0, etaMs: 0 },
    ];
    const sessions = [makeSession('doc-1', 1000, '2026-01-01')];
    const view = presentStats({
      ...EMPTY_INPUT,
      analytics: makeAnalytics({ books }),
      docs: [doc1],
      sessions,
    });
    expect(view.books[0]?.etaLabel).toBe('Finished');
  });

  it('pageCount-unknown book: progressLabel and etaLabel null, but still listed with a session', () => {
    const docUnknown = makeDoc('doc-u', 'Unknown Pages'); // no pageCount
    const books: BookProgress[] = [
      { docId: 'doc-u', pageCount: null, furthestPage: 0, progressRatio: null, pagesRemaining: null, etaMs: null },
    ];
    const sessions = [makeSession('doc-u', 1000, '2026-01-01')];
    const view = presentStats({
      ...EMPTY_INPUT,
      analytics: makeAnalytics({ books }),
      docs: [docUnknown],
      sessions,
    });
    expect(view.books).toHaveLength(1);
    expect(view.books[0]?.progressLabel).toBeNull();
    expect(view.books[0]?.etaLabel).toBeNull();
  });

  it('missing doc title falls back to docId', () => {
    const books: BookProgress[] = [
      { docId: 'doc-orphan', pageCount: 100, furthestPage: 50, progressRatio: 0.5, pagesRemaining: 50, etaMs: null },
    ];
    const sessions = [makeSession('doc-orphan', 1000, '2026-01-01')];
    const view = presentStats({
      ...EMPTY_INPUT,
      analytics: makeAnalytics({ books }),
      docs: [], // no doc record
      sessions,
    });
    expect(view.books[0]?.title).toBe('doc-orphan');
  });
});

// ── 8. hasData ─────────────────────────────────────────────────────────────────

describe('presentStats — hasData', () => {
  it('empty sessions → hasData false', () => {
    const view = presentStats(EMPTY_INPUT);
    expect(view.hasData).toBe(false);
  });

  it('sessions present → hasData true', () => {
    const view = presentStats({
      ...EMPTY_INPUT,
      sessions: [makeSession('doc-1', 1000, '2026-01-01')],
    });
    expect(view.hasData).toBe(true);
  });
});

// ── 9. Streak labels ───────────────────────────────────────────────────────────

describe('presentStats — streak labels', () => {
  it('current 0 → "No streak yet"', () => {
    const view = presentStats({ ...EMPTY_INPUT, habit: makeHabit({ current: 0 }) });
    expect(view.streak.currentLabel).toBe('No streak yet');
  });

  it('current 1 → "1 day"', () => {
    const view = presentStats({ ...EMPTY_INPUT, habit: makeHabit({ current: 1, status: 'lit' }) });
    expect(view.streak.currentLabel).toBe('1 day');
  });

  it('current 12 → "12 days"', () => {
    const view = presentStats({ ...EMPTY_INPUT, habit: makeHabit({ current: 12, status: 'lit' }) });
    expect(view.streak.currentLabel).toBe('12 days');
  });

  it('longest 0 → "Best: —"', () => {
    const view = presentStats({ ...EMPTY_INPUT, habit: makeHabit({ longest: 0 }) });
    expect(view.streak.longestLabel).toBe('Best: —');
  });

  it('longest 21 → "Best: 21 days"', () => {
    const habit = makeHabit({ longest: 21 });
    habit.streak.longest = 21;
    const view = presentStats({ ...EMPTY_INPUT, habit });
    expect(view.streak.longestLabel).toBe('Best: 21 days');
  });

  it('streak status passes through', () => {
    const view = presentStats({ ...EMPTY_INPUT, habit: makeHabit({ status: 'at-risk' }) });
    expect(view.streak.status).toBe('at-risk');
  });
});

// ── 10. Purity / no mutation ───────────────────────────────────────────────────

describe('presentStats — purity', () => {
  it('does not mutate the input docs array', () => {
    const docs = [makeDoc('doc-1', 'Book One', 100)];
    const before = JSON.stringify(docs);
    const books: BookProgress[] = [
      { docId: 'doc-1', pageCount: 100, furthestPage: 50, progressRatio: 0.5, pagesRemaining: 50, etaMs: null },
    ];
    const sessions = [makeSession('doc-1', 1000, '2026-01-01')];
    presentStats({ ...EMPTY_INPUT, analytics: makeAnalytics({ books }), docs, sessions });
    expect(JSON.stringify(docs)).toBe(before);
  });

  it('does not mutate the input sessions array', () => {
    const sessions = [makeSession('doc-1', 1000, '2026-01-01')];
    const before = JSON.stringify(sessions);
    presentStats({ ...EMPTY_INPUT, sessions });
    expect(JSON.stringify(sessions)).toBe(before);
  });

  it('does not mutate the input heatmap array', () => {
    const heatmap = makeHeatmap([{ day: '2026-06-13', activeMs: 1_000 }]);
    const before = JSON.stringify(heatmap);
    presentStats({ ...EMPTY_INPUT, heatmap });
    expect(JSON.stringify(heatmap)).toBe(before);
  });
});

// ── 11. Empty pipeline (all-zero derive+present) ───────────────────────────────

describe('presentStats — empty pipeline yields neutral/zero view', () => {
  it('produces a valid view shape with no crashes', () => {
    const view: StatsView = presentStats(EMPTY_INPUT);
    expect(view.hasData).toBe(false);
    expect(view.streak.currentLabel).toBe('No streak yet');
    expect(view.streak.longestLabel).toBe('Best: —');
    expect(view.heatmap.cells).toHaveLength(0);
    expect(view.heatmap.maxActiveMs).toBe(0);
    expect(view.totals.activeLabel).toBe('0m');
    expect(view.totals.pagesLabel).toBe('0 pages');
    expect(view.totals.daysReadLabel).toBe('0 days');
    expect(view.totals.sessionsLabel).toBe('0 sessions');
    expect(view.speed.pagesPerHourLabel).toBe('—');
    expect(view.timeOfDay.hasAny).toBe(false);
    expect(view.books).toHaveLength(0);
  });
});
