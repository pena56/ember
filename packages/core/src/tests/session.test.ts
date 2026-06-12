import { describe, expect, it } from 'vitest';

import { encode, initialClock, tick } from '../hlc.js';
import {
  IDLE_THRESHOLD_MS,
  type OpenSlice,
  type TrackerState,
  initialTrackerState,
  localDayOf,
  makeReadingSession,
  reduce,
} from '../session.js';

// ---------------------------------------------------------------------------
// Fixed HLC fixtures (same pattern as reading-position.test.ts)
// ---------------------------------------------------------------------------
const hlcA = tick(initialClock('node-a'), 1_000_000);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wall ms at 2024-03-15 00:00:00 UTC */
const BASE_UTC = Date.UTC(2024, 2, 15, 0, 0, 0, 0); // 2024-03-15T00:00:00.000Z

/** Run a sequence of events from an initial state and collect all flushed sessions. */
function runEvents(
  events: Parameters<typeof reduce>[1][],
  initial = initialTrackerState(),
): { finalState: TrackerState; allFlushed: ReturnType<typeof reduce>['flushed'] } {
  let state = initial;
  const allFlushed: ReturnType<typeof reduce>['flushed'] = [];
  for (const event of events) {
    const result = reduce(state, event);
    state = result.state;
    allFlushed.push(...result.flushed);
  }
  return { finalState: state, allFlushed };
}

// ---------------------------------------------------------------------------
// localDayOf
// ---------------------------------------------------------------------------

describe('localDayOf', () => {
  it('formats a UTC epoch as the correct local date for +60 tz', () => {
    // 2024-03-15T23:30:00Z with +60 min offset → local time 2024-03-16T00:30:00 → '2024-03-16'
    const wall = Date.UTC(2024, 2, 15, 23, 30, 0);
    expect(localDayOf(wall, 60)).toBe('2024-03-16');
  });

  it('formats a UTC epoch as the correct local date for -300 tz (EST)', () => {
    // 2024-03-15T03:00:00Z with -300 min offset → local time 2024-03-14T22:00:00 → '2024-03-14'
    const wall = Date.UTC(2024, 2, 15, 3, 0, 0);
    expect(localDayOf(wall, -300)).toBe('2024-03-14');
  });

  it('a wall just before local midnight and one just after land on different dates (+60)', () => {
    // With +60, local midnight = UTC 23:00.
    const beforeMidnight = Date.UTC(2024, 2, 15, 22, 59, 59, 999); // local 2024-03-15T23:59:59.999
    const afterMidnight = Date.UTC(2024, 2, 15, 23, 0, 0, 0); // local 2024-03-16T00:00:00.000
    expect(localDayOf(beforeMidnight, 60)).toBe('2024-03-15');
    expect(localDayOf(afterMidnight, 60)).toBe('2024-03-16');
  });

  it('UTC offset = 0 returns the UTC date', () => {
    const wall = Date.UTC(2024, 2, 15, 12, 0, 0);
    expect(localDayOf(wall, 0)).toBe('2024-03-15');
  });
});

// ---------------------------------------------------------------------------
// Active-time accrual
// ---------------------------------------------------------------------------

describe('active-time accrual', () => {
  it('open then activities at +15s +30s +45s → one session with activeMs = 45_000', () => {
    const t0 = BASE_UTC;
    const tz = 0;
    const { allFlushed } = runEvents([
      { type: 'open', docId: 'doc-1', page: 1, at: t0, tzOffsetMinutes: tz },
      { type: 'activity', at: t0 + 15_000, tzOffsetMinutes: tz },
      { type: 'activity', at: t0 + 30_000, tzOffsetMinutes: tz },
      { type: 'activity', at: t0 + 45_000, tzOffsetMinutes: tz },
      { type: 'close', at: t0 + 50_000 },
    ]);
    expect(allFlushed).toHaveLength(1);
    const s = allFlushed[0]!;
    expect(s.activeMs).toBe(45_000);
    expect(s.startedAt).toBe(t0);
    expect(s.endedAt).toBe(t0 + 45_000);
    expect(s.pages).toEqual([1]);
  });

  it('each gap is capped at idleThreshold but sub-threshold gaps accumulate normally', () => {
    const t0 = BASE_UTC;
    const tz = 0;
    // gaps: 10s, 20s, 30s → total 60s
    const { allFlushed } = runEvents([
      { type: 'open', docId: 'doc-1', page: 1, at: t0, tzOffsetMinutes: tz },
      { type: 'activity', at: t0 + 10_000, tzOffsetMinutes: tz },
      { type: 'activity', at: t0 + 30_000, tzOffsetMinutes: tz },
      { type: 'activity', at: t0 + 60_000, tzOffsetMinutes: tz },
      { type: 'close', at: t0 + 65_000 },
    ]);
    expect(allFlushed).toHaveLength(1);
    expect(allFlushed[0]!.activeMs).toBe(60_000);
  });
});

// ---------------------------------------------------------------------------
// Idle split
// ---------------------------------------------------------------------------

describe('idle split', () => {
  it('gap > 60s flushes first session and starts a new bout', () => {
    const t0 = BASE_UTC;
    const tz = 0;
    // +30s, then +120s (gap 90s > 60s) → first bout: activeMs 30s
    const { allFlushed, finalState } = runEvents([
      { type: 'open', docId: 'doc-1', page: 1, at: t0, tzOffsetMinutes: tz },
      { type: 'activity', at: t0 + 30_000, tzOffsetMinutes: tz },
      { type: 'activity', at: t0 + 120_000, tzOffsetMinutes: tz }, // gap=90s → flush
      { type: 'close', at: t0 + 125_000 },
    ]);
    // First session: open→+30s activity
    expect(allFlushed).toHaveLength(1);
    const first = allFlushed[0]!;
    expect(first.activeMs).toBe(30_000);
    expect(first.endedAt).toBe(t0 + 30_000);
    // Second bout after idle: activeMs = 0 → dropped (zero-active rule)
    expect(finalState.open).toBeNull();
  });

  it('exactly IDLE_THRESHOLD_MS gap does NOT split (boundary is strictly greater-than)', () => {
    const t0 = BASE_UTC;
    const tz = 0;
    const { allFlushed } = runEvents([
      { type: 'open', docId: 'doc-1', page: 1, at: t0, tzOffsetMinutes: tz },
      { type: 'activity', at: t0 + IDLE_THRESHOLD_MS, tzOffsetMinutes: tz }, // exactly threshold → no split
      { type: 'close', at: t0 + IDLE_THRESHOLD_MS + 1 },
    ]);
    expect(allFlushed).toHaveLength(1);
    expect(allFlushed[0]!.activeMs).toBe(IDLE_THRESHOLD_MS);
  });

  it('gap of IDLE_THRESHOLD_MS + 1 splits the bout', () => {
    const t0 = BASE_UTC;
    const tz = 0;
    const { allFlushed } = runEvents([
      { type: 'open', docId: 'doc-1', page: 1, at: t0, tzOffsetMinutes: tz },
      { type: 'activity', at: t0 + IDLE_THRESHOLD_MS + 1, tzOffsetMinutes: tz }, // > threshold → split
      { type: 'close', at: t0 + IDLE_THRESHOLD_MS + 2 },
    ]);
    // First bout: zero-active → dropped. Second bout: zero-active → dropped.
    expect(allFlushed).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Page accumulation
// ---------------------------------------------------------------------------

describe('page accumulation', () => {
  it('page events add distinct ascending page numbers and advance active time', () => {
    const t0 = BASE_UTC;
    const tz = 0;
    const { allFlushed } = runEvents([
      { type: 'open', docId: 'doc-1', page: 1, at: t0, tzOffsetMinutes: tz },
      { type: 'page', page: 2, at: t0 + 10_000, tzOffsetMinutes: tz },
      { type: 'page', page: 3, at: t0 + 20_000, tzOffsetMinutes: tz },
      { type: 'close', at: t0 + 25_000 },
    ]);
    expect(allFlushed).toHaveLength(1);
    const s = allFlushed[0]!;
    expect(s.pages).toEqual([1, 2, 3]);
    expect(s.activeMs).toBe(20_000); // 10s + 10s
  });

  it('a repeated page does not duplicate in pages array', () => {
    const t0 = BASE_UTC;
    const tz = 0;
    const { allFlushed } = runEvents([
      { type: 'open', docId: 'doc-1', page: 2, at: t0, tzOffsetMinutes: tz },
      { type: 'page', page: 2, at: t0 + 10_000, tzOffsetMinutes: tz }, // repeat
      { type: 'page', page: 3, at: t0 + 20_000, tzOffsetMinutes: tz },
      { type: 'close', at: t0 + 25_000 },
    ]);
    expect(allFlushed).toHaveLength(1);
    expect(allFlushed[0]!.pages).toEqual([2, 3]);
  });

  it('pages are kept in ascending order regardless of insertion order', () => {
    const t0 = BASE_UTC;
    const tz = 0;
    const { allFlushed } = runEvents([
      { type: 'open', docId: 'doc-1', page: 5, at: t0, tzOffsetMinutes: tz },
      { type: 'page', page: 3, at: t0 + 10_000, tzOffsetMinutes: tz },
      { type: 'page', page: 7, at: t0 + 20_000, tzOffsetMinutes: tz },
      { type: 'close', at: t0 + 25_000 },
    ]);
    expect(allFlushed[0]!.pages).toEqual([3, 5, 7]);
  });

  it('page numbers are normalized: fractional → truncated, 0 → 1', () => {
    const t0 = BASE_UTC;
    const tz = 0;
    const { allFlushed } = runEvents([
      { type: 'open', docId: 'doc-1', page: 0, at: t0, tzOffsetMinutes: tz }, // → 1
      { type: 'page', page: 3.9, at: t0 + 10_000, tzOffsetMinutes: tz }, // → 3
      { type: 'close', at: t0 + 15_000 },
    ]);
    expect(allFlushed[0]!.pages).toEqual([1, 3]);
  });
});

// ---------------------------------------------------------------------------
// Midnight split
// ---------------------------------------------------------------------------

describe('midnight split', () => {
  it('a bout crossing local midnight produces two sessions with adjacent localDays', () => {
    // Local midnight with tz +60: when UTC is 2024-03-15T23:00:00Z, local time is 2024-03-16T00:00:00+01:00.
    // We place activities on both sides of that boundary with sub-60s gaps.
    const localMidnightUtc = Date.UTC(2024, 2, 15, 23, 0, 0, 0); // UTC of local midnight (tz+60)
    const t0 = localMidnightUtc - 30_000; // 30s before local midnight: local 2024-03-15T23:59:30+01:00
    const tz = 60;

    const { allFlushed } = runEvents([
      { type: 'open', docId: 'doc-1', page: 1, at: t0, tzOffsetMinutes: tz },
      // 15s before midnight — same local day 2024-03-15; gap=15s → accrues 15s
      { type: 'activity', at: t0 + 15_000, tzOffsetMinutes: tz },
      // 15s after midnight — local day is now 2024-03-16; gap=30s ≤ 60s but day changed → flush pre-midnight
      { type: 'activity', at: localMidnightUtc + 15_000, tzOffsetMinutes: tz },
      // 15s later still on 2024-03-16; gap=15s → accrues 15s to post-midnight bout
      { type: 'activity', at: localMidnightUtc + 30_000, tzOffsetMinutes: tz },
      { type: 'close', at: localMidnightUtc + 35_000 },
    ]);

    expect(allFlushed).toHaveLength(2);
    const [pre, post] = allFlushed;
    expect(pre!.localDay).toBe('2024-03-15');
    expect(post!.localDay).toBe('2024-03-16');
    // Pre-midnight slice ends at its last activity (15s before midnight)
    expect(pre!.endedAt).toBe(t0 + 15_000);
    expect(pre!.activeMs).toBe(15_000);
    // Post-midnight slice starts at the crossing activity
    expect(post!.startedAt).toBe(localMidnightUtc + 15_000);
    // Post-midnight accrues 15s (gap between crossing activity and the next activity)
    expect(post!.activeMs).toBe(15_000);
  });
});

// ---------------------------------------------------------------------------
// Zero-active drop
// ---------------------------------------------------------------------------

describe('zero-active drop', () => {
  it('open then immediate close produces no sessions', () => {
    const t0 = BASE_UTC;
    const { allFlushed } = runEvents([
      { type: 'open', docId: 'doc-1', page: 1, at: t0, tzOffsetMinutes: 0 },
      { type: 'close', at: t0 + 1_000 },
    ]);
    expect(allFlushed).toHaveLength(0);
  });

  it('open → one activity → close produces exactly one session', () => {
    const t0 = BASE_UTC;
    const tz = 0;
    const { allFlushed } = runEvents([
      { type: 'open', docId: 'doc-1', page: 1, at: t0, tzOffsetMinutes: tz },
      { type: 'activity', at: t0 + 30_000, tzOffsetMinutes: tz },
      { type: 'close', at: t0 + 35_000 },
    ]);
    expect(allFlushed).toHaveLength(1);
    expect(allFlushed[0]!.activeMs).toBe(30_000);
  });
});

// ---------------------------------------------------------------------------
// Open-over-open
// ---------------------------------------------------------------------------

describe('open-over-open', () => {
  it('opening doc B while doc A is active flushes A (if active) then opens B', () => {
    const t0 = BASE_UTC;
    const tz = 0;
    const { allFlushed, finalState } = runEvents([
      { type: 'open', docId: 'doc-A', page: 1, at: t0, tzOffsetMinutes: tz },
      { type: 'activity', at: t0 + 20_000, tzOffsetMinutes: tz },
      // Open doc B — should flush doc A
      { type: 'open', docId: 'doc-B', page: 3, at: t0 + 25_000, tzOffsetMinutes: tz },
      { type: 'activity', at: t0 + 45_000, tzOffsetMinutes: tz },
      { type: 'close', at: t0 + 50_000 },
    ]);

    expect(allFlushed).toHaveLength(2);
    expect(allFlushed[0]!.docId).toBe('doc-A');
    expect(allFlushed[0]!.activeMs).toBe(20_000);
    expect(allFlushed[1]!.docId).toBe('doc-B');
    expect(allFlushed[1]!.activeMs).toBe(20_000);
    expect(finalState.open).toBeNull();
  });

  it('opening doc B while doc A has zero active time drops doc A', () => {
    const t0 = BASE_UTC;
    const tz = 0;
    const { allFlushed } = runEvents([
      { type: 'open', docId: 'doc-A', page: 1, at: t0, tzOffsetMinutes: tz },
      // No activity for doc A — zero-active → should be dropped when B opens
      { type: 'open', docId: 'doc-B', page: 1, at: t0 + 5_000, tzOffsetMinutes: tz },
      { type: 'close', at: t0 + 10_000 },
    ]);
    expect(allFlushed).toHaveLength(0); // doc A dropped (zero-active), doc B dropped (zero-active)
  });
});

// ---------------------------------------------------------------------------
// Purity — reduce does not mutate input state
// ---------------------------------------------------------------------------

describe('purity', () => {
  it('reduce does not mutate the input state object', () => {
    const t0 = BASE_UTC;
    const tz = 0;
    const initial = initialTrackerState();
    const after1 = reduce(initial, { type: 'open', docId: 'doc-1', page: 1, at: t0, tzOffsetMinutes: tz });

    // Freeze the returned state to catch any mutation on subsequent calls
    const frozen = Object.freeze({ open: Object.freeze(after1.state.open) as OpenSlice }) as TrackerState;
    // This should not throw
    const after2 = reduce(frozen, { type: 'activity', at: t0 + 10_000, tzOffsetMinutes: tz });

    // The frozen state's open slice is unmodified
    expect(frozen.open!.activeMs).toBe(0);
    expect(frozen.open!.lastActivityAt).toBe(t0);
    // The new state has the updated values
    expect(after2.state.open!.activeMs).toBe(10_000);
    expect(after2.state.open!.lastActivityAt).toBe(t0 + 10_000);
  });

  it('reduce does not mutate the input state on close', () => {
    const t0 = BASE_UTC;
    const tz = 0;
    let state = initialTrackerState();
    state = reduce(state, { type: 'open', docId: 'doc-1', page: 1, at: t0, tzOffsetMinutes: tz }).state;
    state = reduce(state, { type: 'activity', at: t0 + 30_000, tzOffsetMinutes: tz }).state;

    const beforeClose = { ...state, open: state.open ? { ...state.open, pages: [...state.open.pages] } : null };
    // Freeze so any in-place mutation on the close path throws.
    const frozen = Object.freeze({ open: Object.freeze(state.open) as OpenSlice }) as TrackerState;
    reduce(frozen, { type: 'close', at: t0 + 35_000 });

    // state was not mutated
    expect(frozen.open).not.toBeNull();
    expect(frozen.open!.activeMs).toBe(beforeClose.open!.activeMs);
    expect(frozen.open!.lastActivityAt).toBe(beforeClose.open!.lastActivityAt);
    expect(frozen.open!.pages).toEqual(beforeClose.open!.pages);
  });
});

// ---------------------------------------------------------------------------
// activity / page events when state.open is null → no-op
// ---------------------------------------------------------------------------

describe('defensive no-op when open is null', () => {
  it('activity with no open slice is a no-op', () => {
    const state = initialTrackerState();
    const result = reduce(state, { type: 'activity', at: BASE_UTC + 1000, tzOffsetMinutes: 0 });
    expect(result.flushed).toHaveLength(0);
    expect(result.state).toBe(state); // same reference returned
  });

  it('page with no open slice is a no-op', () => {
    const state = initialTrackerState();
    const result = reduce(state, { type: 'page', page: 5, at: BASE_UTC + 1000, tzOffsetMinutes: 0 });
    expect(result.flushed).toHaveLength(0);
    expect(result.state).toBe(state);
  });
});

// ---------------------------------------------------------------------------
// makeReadingSession
// ---------------------------------------------------------------------------

describe('makeReadingSession', () => {
  const flushed = {
    docId: 'doc-xyz',
    localDay: '2024-03-15',
    tzOffsetMinutes: 60,
    startedAt: BASE_UTC,
    endedAt: BASE_UTC + 45_000,
    activeMs: 45_000,
    pages: [1, 2, 3],
  };

  it('sets updatedAt to encode(hlc)', () => {
    const session = makeReadingSession(flushed, { id: 'uuid-1', hlc: hlcA });
    expect(session.updatedAt).toBe(encode(hlcA));
  });

  it('sets id from the supplied id argument', () => {
    const session = makeReadingSession(flushed, { id: 'my-uuid', hlc: hlcA });
    expect(session.id).toBe('my-uuid');
  });

  it('preserves all flushed fields', () => {
    const session = makeReadingSession(flushed, { id: 'uuid-1', hlc: hlcA });
    expect(session.docId).toBe(flushed.docId);
    expect(session.localDay).toBe(flushed.localDay);
    expect(session.tzOffsetMinutes).toBe(flushed.tzOffsetMinutes);
    expect(session.startedAt).toBe(flushed.startedAt);
    expect(session.endedAt).toBe(flushed.endedAt);
    expect(session.activeMs).toBe(flushed.activeMs);
    expect(session.pages).toEqual(flushed.pages);
  });

  it('maps all fields correctly end-to-end', () => {
    const session = makeReadingSession(flushed, { id: 'uuid-1', hlc: hlcA });
    expect(session).toEqual({
      ...flushed,
      id: 'uuid-1',
      updatedAt: encode(hlcA),
    });
  });
});
