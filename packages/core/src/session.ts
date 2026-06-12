// ReadingSession type + pure tracker reducer — no platform APIs, no Date.now().
// Invariant: core imports no platform API (code-standards).

import { type Hlc, encode } from './hlc.js';

/**
 * An immutable record of one continuous reading bout for a document.
 * id = fresh uuid supplied by the store use-case at persist time (not docId — many per document).
 * localDay = 'YYYY-MM-DD' local calendar date of the slice (invariant #4: stamped at capture).
 * tzOffsetMinutes = minutes **east** of UTC (e.g. +60 CET, -300 EST).
 * startedAt / endedAt = wall ms epoch of the slice's first / last activity.
 * activeMs = idle-capped engaged time in ms (integer ≥ 0).
 * pages = distinct 1-based page numbers visited, ascending.
 * updatedAt = encoded HLC stamp — lexicographic sort agrees with compare.
 */
export type ReadingSession = {
  id: string;
  docId: string;
  localDay: string;
  tzOffsetMinutes: number;
  startedAt: number;
  endedAt: number;
  activeMs: number;
  pages: number[];
  updatedAt: string;
};

/**
 * What the reducer emits — the store use-case stamps id + updatedAt at persist time.
 * Core stays uuid/clock-free (consistent with 06a/04a).
 */
export type FlushedSession = Omit<ReadingSession, 'id' | 'updatedAt'>;

/** A gap larger than this between activity events ends the current reading bout. */
export const IDLE_THRESHOLD_MS = 60_000;

/**
 * Internal accumulator for the current open reading bout.
 * Exported for test assertions.
 */
export type OpenSlice = {
  docId: string;
  localDay: string;
  tzOffsetMinutes: number;
  startedAt: number;
  lastActivityAt: number;
  activeMs: number;
  pages: number[];
};

/** Reducer state — one open slice at most (one document at a time). */
export type TrackerState = { open: OpenSlice | null };

/** Factory for the initial (empty) tracker state. */
export function initialTrackerState(): TrackerState {
  return { open: null };
}

/** Events the caller emits from the reader UI. All times are wall-clock ms epochs. */
export type TrackerEvent =
  | { type: 'open'; docId: string; page: number; at: number; tzOffsetMinutes: number }
  | { type: 'activity'; at: number; tzOffsetMinutes: number }
  | { type: 'page'; page: number; at: number; tzOffsetMinutes: number }
  | { type: 'close'; at: number };

/**
 * Format a wall-clock ms epoch + tz offset as a 'YYYY-MM-DD' local calendar date.
 * Pure: uses a supplied epoch (not Date.now()). No tz database — just arithmetic.
 * The HLC rule bans Date.now() for *ordering*, not Date for formatting a passed-in time.
 */
export function localDayOf(wall: number, tzOffsetMinutes: number): string {
  return new Date(wall + tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Normalize a raw page number: integer ≥ 1. */
function normalizePage(page: number): number {
  return Math.max(1, Math.trunc(page));
}

/** Insert a page into a sorted-distinct array (no duplicates, ascending order). */
function insertPage(pages: number[], page: number): number[] {
  if (pages.includes(page)) return pages;
  return [...pages, page].sort((a, b) => a - b);
}

/**
 * Finalize an open slice into a FlushedSession array.
 * Returns [] if slice is null or activeMs === 0 (zero-active sessions are dropped).
 */
function finalize(slice: OpenSlice | null): FlushedSession[] {
  if (!slice || slice.activeMs === 0) return [];
  return [
    {
      docId: slice.docId,
      localDay: slice.localDay,
      tzOffsetMinutes: slice.tzOffsetMinutes,
      startedAt: slice.startedAt,
      endedAt: slice.lastActivityAt,
      activeMs: slice.activeMs,
      // Copy so a flushed session never aliases internal slice state.
      pages: [...slice.pages],
    },
  ];
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

/**
 * Pure reducer: applies one TrackerEvent to the current TrackerState.
 * Never mutates the input state — always returns new objects.
 *
 * Active-time model (idle-capped sum of inter-activity gaps):
 *   - gap ≤ idleThresholdMs AND same local day → continuous: activeMs += gap.
 *   - gap > idleThresholdMs OR day changed → flush current slice, start fresh.
 */
export function reduce(
  state: TrackerState,
  event: TrackerEvent,
  idleThresholdMs = IDLE_THRESHOLD_MS,
): { state: TrackerState; flushed: FlushedSession[] } {
  switch (event.type) {
    case 'open': {
      // Flush any currently open slice, then start a fresh one.
      const flushed = finalize(state.open);
      const page = normalizePage(event.page);
      const newSlice: OpenSlice = {
        docId: event.docId,
        localDay: localDayOf(event.at, event.tzOffsetMinutes),
        tzOffsetMinutes: event.tzOffsetMinutes,
        startedAt: event.at,
        lastActivityAt: event.at,
        activeMs: 0,
        // normalizePage guarantees page >= 1, so the slice always opens on its page.
        pages: [page],
      };
      return { state: { open: newSlice }, flushed };
    }

    case 'activity': {
      if (!state.open) return { state, flushed: [] };
      const slice = state.open;
      const gap = event.at - slice.lastActivityAt;
      const day = localDayOf(event.at, event.tzOffsetMinutes);

      if (gap > idleThresholdMs || day !== slice.localDay) {
        // Idle or midnight boundary — flush and start fresh.
        const flushed = finalize(slice);
        const newSlice: OpenSlice = {
          docId: slice.docId,
          localDay: day,
          tzOffsetMinutes: event.tzOffsetMinutes,
          startedAt: event.at,
          lastActivityAt: event.at,
          activeMs: 0,
          pages: [],
        };
        return { state: { open: newSlice }, flushed };
      }

      // Continuous engagement — accrue active time.
      const updated: OpenSlice = {
        ...slice,
        lastActivityAt: event.at,
        activeMs: slice.activeMs + gap,
      };
      return { state: { open: updated }, flushed: [] };
    }

    case 'page': {
      if (!state.open) return { state, flushed: [] };
      const slice = state.open;
      const gap = event.at - slice.lastActivityAt;
      const day = localDayOf(event.at, event.tzOffsetMinutes);
      const page = normalizePage(event.page);

      if (gap > idleThresholdMs || day !== slice.localDay) {
        // Idle or midnight boundary — flush and start fresh with this page.
        const flushed = finalize(slice);
        const newSlice: OpenSlice = {
          docId: slice.docId,
          localDay: day,
          tzOffsetMinutes: event.tzOffsetMinutes,
          startedAt: event.at,
          lastActivityAt: event.at,
          activeMs: 0,
          pages: [page],
        };
        return { state: { open: newSlice }, flushed };
      }

      // Continuous — accrue time and record page.
      const updated: OpenSlice = {
        ...slice,
        lastActivityAt: event.at,
        activeMs: slice.activeMs + gap,
        pages: insertPage(slice.pages, page),
      };
      return { state: { open: updated }, flushed: [] };
    }

    case 'close': {
      const flushed = finalize(state.open);
      return { state: { open: null }, flushed };
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Pure factory: stamps a FlushedSession into a full ReadingSession with id + updatedAt.
 * Hlc/encode from ./hlc.js. Core stays runtime-dep-free (no uuid) — caller supplies both.
 */
export function makeReadingSession(
  flushed: FlushedSession,
  args: { id: string; hlc: Hlc },
): ReadingSession {
  return {
    ...flushed,
    id: args.id,
    updatedAt: encode(args.hlc),
  };
}
