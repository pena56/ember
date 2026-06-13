/**
 * present-stats.ts — pure AnalyticsSummary + HabitSummary → StatsView mapper.
 *
 * No DOM, no React, no Date. All formatting/binning/ordering/pluralization
 * logic lives here so it is unit-tested without rendering (invariant #3).
 * The hook computes today/window/tz and passes the derived results in;
 * this presenter never reads a clock.
 */

import type {
  AnalyticsSummary,
  Document,
  DayPart,
  HabitSummary,
  HeatmapCell,
  ReadingSession,
  StreakStatus,
} from '@ember/core';

// ── Input ──────────────────────────────────────────────────────────────────────

export interface PresentStatsInput {
  habit: HabitSummary;         // 08a — streak.current / .longest / .status
  analytics: AnalyticsSummary; // 09d — totals / speed / timeOfDay / books
  heatmap: HeatmapCell[];      // 09d buildHeatmap output (dense, fromDay..toDay)
  docs: Document[];            // for docId → title
  sessions: ReadingSession[];  // for per-doc most-recent endedAt (book ordering)
}

// ── View model ─────────────────────────────────────────────────────────────────

export interface StatsView {
  hasData: boolean;            // sessions.length > 0 — drives empty state
  streak: {
    currentLabel: string;      // "12 days" / "1 day" / "No streak yet"
    longestLabel: string;      // "Best: 21 days" / "Best: —"
    status: StreakStatus;
  };
  heatmap: {
    cells: { day: string; level: 0 | 1 | 2 | 3 | 4; activeMs: number; label: string }[];
    maxActiveMs: number;       // for the legend
  };
  totals: {
    activeLabel: string;       // "4h 12m" / "12m" / "0m"
    pagesLabel: string;        // "318 pages" / "1 page" / "0 pages"
    daysReadLabel: string;     // "9 days" / "1 day"
    sessionsLabel: string;     // "14 sessions" / "1 session"
  };
  speed: { pagesPerHourLabel: string }; // "27 pages/hour" or "—"
  timeOfDay: {
    parts: { part: DayPart; label: string; activeMs: number; fraction: number }[];
    hasAny: boolean;           // false → all zero
  };
  books: {
    docId: string;
    title: string;
    progressLabel: string | null; // "64%" / "100%" / null (pageCount unknown)
    etaLabel: string | null;      // "~2h left" / "Finished" / null
    progressRatio: number | null; // for bar width (0..1) — null → indeterminate
  }[];
}

// ── Duration formatting ────────────────────────────────────────────────────────

/**
 * Format milliseconds as a compact duration string.
 * 0 → "0m", < 1h → "Nm", ≥ 1h → "Hh Mm" (trailing "0m" dropped → "2h").
 */
function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 60) {
    return `${totalMinutes.toString()}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) {
    return `${hours.toString()}h`;
  }
  return `${hours.toString()}h ${minutes.toString()}m`;
}

// ── Pluralization helpers ──────────────────────────────────────────────────────

function plural(n: number, word: string): string {
  return `${n.toString()} ${word}${n === 1 ? '' : 's'}`;
}

// ── Presenter ─────────────────────────────────────────────────────────────────

export function presentStats(input: PresentStatsInput): StatsView {
  const { habit, analytics, heatmap, docs, sessions } = input;

  // hasData
  const hasData = sessions.length > 0;

  // ── Streak ──────────────────────────────────────────────────────────────────

  const currentN = habit.streak.current;
  const longestN = habit.streak.longest;

  const currentLabel = currentN === 0
    ? 'No streak yet'
    : plural(currentN, 'day');

  const longestLabel = longestN === 0
    ? 'Best: —'
    : `Best: ${plural(longestN, 'day')}`;

  // ── Heatmap ─────────────────────────────────────────────────────────────────

  const maxActiveMs = heatmap.reduce((max, c) => Math.max(max, c.activeMs), 0);

  const heatmapCells = heatmap.map((cell) => {
    let level: 0 | 1 | 2 | 3 | 4;
    if (cell.activeMs === 0 || maxActiveMs === 0) {
      level = 0;
    } else {
      const raw = Math.ceil((cell.activeMs / maxActiveMs) * 4);
      level = Math.min(4, Math.max(1, raw)) as 1 | 2 | 3 | 4;
    }
    const label = `${cell.day}: ${formatDuration(cell.activeMs)}`;
    return { day: cell.day, level, activeMs: cell.activeMs, label };
  });

  // ── Totals ──────────────────────────────────────────────────────────────────

  const { totals, speed, timeOfDay, books: bookProgress } = analytics;

  const activeLabel = formatDuration(totals.activeMs);
  const pagesLabel = plural(totals.pagesTurned, 'page');
  const daysReadLabel = plural(totals.daysRead, 'day');
  const sessionsLabel = plural(totals.sessions, 'session');

  // ── Speed ───────────────────────────────────────────────────────────────────

  const pagesPerHourLabel = speed.pagesPerHour === null
    ? '—'
    : `${Math.round(speed.pagesPerHour).toString()} pages/hour`;

  // ── Time-of-day ─────────────────────────────────────────────────────────────

  const DAY_PARTS: DayPart[] = ['morning', 'afternoon', 'evening', 'night'];
  const totalTimeOfDay = DAY_PARTS.reduce((sum, part) => sum + timeOfDay[part], 0);
  const hasAny = totalTimeOfDay > 0;

  const parts = DAY_PARTS.map((part) => {
    const activeMs = timeOfDay[part];
    const fraction = totalTimeOfDay > 0 ? activeMs / totalTimeOfDay : 0;
    const label = formatDuration(activeMs);
    return { part, label, activeMs, fraction };
  });

  // ── Books ───────────────────────────────────────────────────────────────────

  // Build a map of docId → most-recent endedAt
  const lastReadByDoc = new Map<string, number>();
  for (const s of sessions) {
    const current = lastReadByDoc.get(s.docId) ?? -Infinity;
    if (s.endedAt > current) {
      lastReadByDoc.set(s.docId, s.endedAt);
    }
  }

  // Build title lookup
  const titleByDocId = new Map<string, string>();
  for (const doc of docs) {
    titleByDocId.set(doc.id, doc.title);
  }

  // Filter to docs with ≥1 session, sort by most-recent endedAt desc (stable)
  const booksWithSessions = bookProgress
    .filter((bp) => lastReadByDoc.has(bp.docId))
    .slice() // avoid mutating input
    .sort((a, b) => {
      const aLast = lastReadByDoc.get(a.docId) ?? 0;
      const bLast = lastReadByDoc.get(b.docId) ?? 0;
      return bLast - aLast; // desc
    });

  const bookViews = booksWithSessions.map((bp) => {
    const title = titleByDocId.get(bp.docId) ?? bp.docId;

    const progressLabel = bp.progressRatio === null
      ? null
      : `${Math.round(bp.progressRatio * 100).toString()}%`;

    let etaLabel: string | null;
    if (bp.etaMs === null) {
      etaLabel = null;
    } else if (bp.pagesRemaining === 0) {
      etaLabel = 'Finished';
    } else {
      etaLabel = `~${formatDuration(bp.etaMs)} left`;
    }

    return {
      docId: bp.docId,
      title,
      progressLabel,
      etaLabel,
      progressRatio: bp.progressRatio,
    };
  });

  return {
    hasData,
    streak: {
      currentLabel,
      longestLabel,
      status: habit.streak.status,
    },
    heatmap: {
      cells: heatmapCells,
      maxActiveMs,
    },
    totals: {
      activeLabel,
      pagesLabel,
      daysReadLabel,
      sessionsLabel,
    },
    speed: { pagesPerHourLabel },
    timeOfDay: { parts, hasAny },
    books: bookViews,
  };
}
