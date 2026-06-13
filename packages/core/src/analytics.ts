// analytics.ts — pure analytics derivation engine. No platform APIs; no Date.now().
// Invariant: core imports no platform API (code-standards).

import type { Document } from './document.js';
import type { ReadingPosition } from './reading-position.js';
import type { ReadingSession } from './session.js';
import { activeMsByDay, nextLocalDay } from './streak.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MS_PER_HOUR = 3_600_000;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Local hour 0..23 of a wall-clock ms epoch at the given tz offset (minutes east of UTC).
 */
export function hourOf(wall: number, tzOffsetMinutes: number): number {
  return new Date(wall + tzOffsetMinutes * 60_000).getUTCHours();
}

// ---------------------------------------------------------------------------
// 1. Totals
// ---------------------------------------------------------------------------

export type ReadingTotals = {
  activeMs: number;    // Σ session.activeMs
  pagesTurned: number; // Σ session.pages.length
  daysRead: number;    // distinct localDays with activeMs > 0
  sessions: number;    // session count
};

/**
 * Sum activeMs, pagesTurned, daysRead, sessions across all sessions.
 * daysRead counts distinct localDays that have at least 1ms of activeMs.
 */
export function deriveTotals(sessions: ReadingSession[]): ReadingTotals {
  let activeMs = 0;
  let pagesTurned = 0;
  // Reuse activeMsByDay for day-level summing
  const byDay = activeMsByDay(sessions);
  let daysRead = 0;
  for (const ms of byDay.values()) {
    if (ms > 0) daysRead += 1;
  }
  for (const s of sessions) {
    activeMs += s.activeMs;
    pagesTurned += s.pages.length;
  }
  return {
    activeMs,
    pagesTurned,
    daysRead,
    sessions: sessions.length,
  };
}

// ---------------------------------------------------------------------------
// 2. Speed
// ---------------------------------------------------------------------------

export type ReadingSpeed = {
  pagesPerHour: number | null; // pagesTurned / (activeMs / 3.6e6); null if no data
  msPerPage: number | null;    // activeMs / pagesTurned; null if no data
};

/**
 * Compute global reading speed across all sessions.
 * Returns null for both fields if activeMs === 0 or pagesTurned === 0.
 */
export function deriveSpeed(sessions: ReadingSession[]): ReadingSpeed {
  let activeMs = 0;
  let pagesTurned = 0;
  for (const s of sessions) {
    activeMs += s.activeMs;
    pagesTurned += s.pages.length;
  }
  if (activeMs === 0 || pagesTurned === 0) {
    return { pagesPerHour: null, msPerPage: null };
  }
  return {
    pagesPerHour: pagesTurned / (activeMs / MS_PER_HOUR),
    msPerPage: activeMs / pagesTurned,
  };
}

// ---------------------------------------------------------------------------
// 3. Time-of-day
// ---------------------------------------------------------------------------

export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';
export type TimeOfDay = Record<DayPart, number>; // activeMs per part

/**
 * Map an hour (0..23) to its day part.
 * morning 05–11, afternoon 12–16, evening 17–21, night 22–04.
 */
export function dayPartOfHour(hour: number): DayPart {
  if (hour >= 5 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 16) return 'afternoon';
  if (hour >= 17 && hour <= 21) return 'evening';
  return 'night'; // 22–23 and 0–4
}

/**
 * Accumulate each session's activeMs into the day-part of its local start hour.
 */
export function deriveTimeOfDay(sessions: ReadingSession[]): TimeOfDay {
  const result: TimeOfDay = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  for (const s of sessions) {
    const part = dayPartOfHour(hourOf(s.startedAt, s.tzOffsetMinutes));
    result[part] += s.activeMs;
  }
  return result;
}

// ---------------------------------------------------------------------------
// 4. Heatmap
// ---------------------------------------------------------------------------

export type HeatmapCell = { day: string; activeMs: number; sessions: number };

/**
 * Build a dense, inclusive series of cells from fromDay to toDay.
 * Uses activeMsByDay for activeMs sums and counts per-day session occurrences.
 * If fromDay > toDay, returns [].
 */
export function buildHeatmap(
  sessions: ReadingSession[],
  fromDay: string,
  toDay: string,
): HeatmapCell[] {
  if (fromDay > toDay) return [];

  // Build per-day maps
  const activeMap = activeMsByDay(sessions);
  const countMap = new Map<string, number>();
  for (const s of sessions) {
    countMap.set(s.localDay, (countMap.get(s.localDay) ?? 0) + 1);
  }

  const cells: HeatmapCell[] = [];
  let d = fromDay;
  while (d <= toDay) {
    cells.push({
      day: d,
      activeMs: activeMap.get(d) ?? 0,
      sessions: countMap.get(d) ?? 0,
    });
    d = nextLocalDay(d);
  }
  return cells;
}

// ---------------------------------------------------------------------------
// 5. Per-book progress + ETA
// ---------------------------------------------------------------------------

export type BookProgress = {
  docId: string;
  pageCount: number | null;       // from Document; null if unknown
  furthestPage: number;           // reading-position page, else max session page, else 0
  progressRatio: number | null;   // furthestPage / pageCount, clamped 0..1; null if pageCount unknown
  pagesRemaining: number | null;  // max(0, pageCount - furthestPage); null if pageCount unknown
  etaMs: number | null;           // pagesRemaining * effectiveMsPerPage; null if not estimable
};

/**
 * Derive per-book progress for every document in `docs`.
 * Output order mirrors docs order (one entry per doc).
 */
export function deriveBookProgress(
  sessions: ReadingSession[],
  docs: Document[],
  positions: ReadingPosition[],
): BookProgress[] {
  // Pre-compute global speed fallback
  const globalSpeed = deriveSpeed(sessions);

  // Build a map of docId → sessions for per-book speed
  const sessionsByDoc = new Map<string, ReadingSession[]>();
  for (const s of sessions) {
    const list = sessionsByDoc.get(s.docId);
    if (list) {
      list.push(s);
    } else {
      sessionsByDoc.set(s.docId, [s]);
    }
  }

  // Build position lookup
  const positionByDocId = new Map<string, ReadingPosition>();
  for (const p of positions) {
    positionByDocId.set(p.id, p);
  }

  return docs.map((doc): BookProgress => {
    const docId = doc.id;
    const docSessions = sessionsByDoc.get(docId) ?? [];

    // Furthest page: position > max session page > 0
    const position = positionByDocId.get(docId);
    let furthestPage: number;
    if (position !== undefined) {
      furthestPage = position.page;
    } else if (docSessions.length > 0) {
      let maxPage = 0;
      for (const s of docSessions) {
        for (const p of s.pages) {
          if (p > maxPage) maxPage = p;
        }
      }
      furthestPage = maxPage;
    } else {
      furthestPage = 0;
    }

    const pageCount = doc.pageCount ?? null;

    // If pageCount unknown, all derived fields are null
    if (pageCount === null) {
      return {
        docId,
        pageCount: null,
        furthestPage,
        progressRatio: null,
        pagesRemaining: null,
        etaMs: null,
      };
    }

    const progressRatio = Math.min(1, Math.max(0, furthestPage / pageCount));
    const pagesRemaining = Math.max(0, pageCount - furthestPage);

    // ETA: per-book speed, fall back to global, else null
    const bookSpeed = deriveSpeed(docSessions);
    const effectiveMsPerPage = bookSpeed.msPerPage ?? globalSpeed.msPerPage;

    let etaMs: number | null;
    if (effectiveMsPerPage === null) {
      etaMs = null;
    } else {
      etaMs = pagesRemaining * effectiveMsPerPage;
    }

    return {
      docId,
      pageCount,
      furthestPage,
      progressRatio,
      pagesRemaining,
      etaMs,
    };
  });
}

// ---------------------------------------------------------------------------
// Top-level composition
// ---------------------------------------------------------------------------

export type AnalyticsSummary = {
  totals: ReadingTotals;
  speed: ReadingSpeed;
  timeOfDay: TimeOfDay;
  books: BookProgress[];
};

/**
 * Compose all range-free rollups into a single summary.
 * NOTE: buildHeatmap is NOT included — it requires a window; callers invoke it separately.
 */
export function deriveAnalytics(
  sessions: ReadingSession[],
  docs: Document[],
  positions: ReadingPosition[],
): AnalyticsSummary {
  return {
    totals: deriveTotals(sessions),
    speed: deriveSpeed(sessions),
    timeOfDay: deriveTimeOfDay(sessions),
    books: deriveBookProgress(sessions, docs, positions),
  };
}
