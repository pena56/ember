/**
 * session-tracker.ts — pure session-tracking seam.
 *
 * Holds TrackerState in a closure, applies @ember/core's reduce, and forwards
 * each FlushedSession to the caller-supplied onFlush callback.
 *
 * Pure: no React, no react-native, no DOM, no timers, no Date.now() — all
 * injected by the caller.
 */

import { type FlushedSession, type TrackerEvent, type TrackerState, initialTrackerState, reduce } from '@ember/core';

// ── Public types ──────────────────────────────────────────────────────────────

export interface SessionTracker {
  open(docId: string, page: number): void;
  activity(): void;
  page(page: number): void;
  close(): void;
}

export interface SessionTrackerDeps {
  /** Returns current wall-clock time in ms (e.g. Date.now()). */
  now: () => number;
  /** Returns the current tz offset in minutes east of UTC (-getTimezoneOffset()). */
  tzOffset: () => number;
  /** Called for each FlushedSession emitted by reduce, in order. */
  onFlush: (flushed: FlushedSession) => void;
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a pure SessionTracker backed by 07a's reduce.
 *
 * One tracker per reader mount. The platform hook (use-session-tracking.ts)
 * owns timers and AppState subscriptions; this seam is fully synchronous and
 * unit-testable without any native globals.
 */
export function createSessionTracker(deps: SessionTrackerDeps): SessionTracker {
  let state: TrackerState = initialTrackerState();

  function dispatch(event: TrackerEvent): void {
    const result = reduce(state, event);
    state = result.state;
    for (const f of result.flushed) {
      deps.onFlush(f);
    }
  }

  return {
    open(docId: string, page: number): void {
      dispatch({
        type: 'open',
        docId,
        page,
        at: deps.now(),
        tzOffsetMinutes: deps.tzOffset(),
      });
    },

    activity(): void {
      dispatch({
        type: 'activity',
        at: deps.now(),
        tzOffsetMinutes: deps.tzOffset(),
      });
    },

    page(page: number): void {
      dispatch({
        type: 'page',
        page,
        at: deps.now(),
        tzOffsetMinutes: deps.tzOffset(),
      });
    },

    close(): void {
      dispatch({
        type: 'close',
        at: deps.now(),
      });
    },
  };
}
