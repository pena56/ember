// analytics.test.ts — exhaustive pure derivation tests for analytics engine.
// No platform APIs; no Date.now(). Fixtures built with makeSession() helper.

import { describe, expect, it } from 'vitest';

import {
  buildHeatmap,
  dayPartOfHour,
  deriveAnalytics,
  deriveBookProgress,
  deriveSpeed,
  deriveTimeOfDay,
  deriveTotals,
  hourOf,
} from '../analytics.js';
import type { Document } from '../document.js';
import type { ReadingPosition } from '../reading-position.js';
import type { ReadingSession } from '../session.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let _id = 0;
function makeSession(partial: Partial<ReadingSession> & { docId: string; localDay: string }): ReadingSession {
  return {
    id: `s${++_id}`,
    docId: partial.docId,
    localDay: partial.localDay,
    tzOffsetMinutes: partial.tzOffsetMinutes ?? 0,
    startedAt: partial.startedAt ?? 0,
    endedAt: partial.endedAt ?? (partial.activeMs ?? 0),
    activeMs: partial.activeMs ?? 0,
    pages: partial.pages ?? [1],
    updatedAt: '',
  };
}

function makeDoc(id: string, pageCount?: number): Document {
  return {
    id,
    title: `Book ${id}`,
    filename: `${id}.pdf`,
    byteSize: 1000,
    contentType: 'application/pdf',
    importedAt: 0,
    ...(pageCount !== undefined ? { pageCount } : {}),
  };
}

function makePosition(id: string, page: number): ReadingPosition {
  return { id, page, offset: 0, updatedAt: '' };
}

// ---------------------------------------------------------------------------
// 1. deriveTotals
// ---------------------------------------------------------------------------

describe('deriveTotals — empty', () => {
  it('returns all-zero for empty sessions', () => {
    expect(deriveTotals([])).toEqual({
      activeMs: 0,
      pagesTurned: 0,
      daysRead: 0,
      sessions: 0,
    });
  });
});

describe('deriveTotals — sums', () => {
  it('sums activeMs, pagesTurned, counts sessions and daysRead', () => {
    const sessions = [
      makeSession({ docId: 'a', localDay: '2026-01-01', activeMs: 1000, pages: [1, 2, 3] }),
      makeSession({ docId: 'a', localDay: '2026-01-02', activeMs: 2000, pages: [4, 5] }),
      makeSession({ docId: 'b', localDay: '2026-01-01', activeMs: 500, pages: [1] }),
    ];
    const result = deriveTotals(sessions);
    expect(result.activeMs).toBe(3500);
    expect(result.pagesTurned).toBe(6); // 3 + 2 + 1
    expect(result.sessions).toBe(3);
    expect(result.daysRead).toBe(2); // 2026-01-01 and 2026-01-02
  });

  it('does not count a zero-activeMs day in daysRead', () => {
    const sessions = [
      makeSession({ docId: 'a', localDay: '2026-01-01', activeMs: 0, pages: [] }),
      makeSession({ docId: 'a', localDay: '2026-01-02', activeMs: 1000, pages: [1] }),
    ];
    const result = deriveTotals(sessions);
    expect(result.daysRead).toBe(1);
  });

  it('multiple sessions same day count day once', () => {
    const sessions = [
      makeSession({ docId: 'a', localDay: '2026-01-01', activeMs: 1000, pages: [1] }),
      makeSession({ docId: 'a', localDay: '2026-01-01', activeMs: 2000, pages: [2] }),
    ];
    const result = deriveTotals(sessions);
    expect(result.daysRead).toBe(1);
    expect(result.sessions).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 2. deriveSpeed
// ---------------------------------------------------------------------------

describe('deriveSpeed — known fixture', () => {
  it('computes exact pagesPerHour and msPerPage', () => {
    // 3600000 ms (1 hour) active, 10 pages turned → 10 pph, 360000 ms/page
    const sessions = [
      makeSession({ docId: 'a', localDay: '2026-01-01', activeMs: 3_600_000, pages: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }),
    ];
    const result = deriveSpeed(sessions);
    expect(result.pagesPerHour).toBe(10);
    expect(result.msPerPage).toBe(360_000);
  });

  it('two sessions — correct combined computation', () => {
    // 7200000 ms active, 4 pages → 2 pph, 1800000 ms/page
    const sessions = [
      makeSession({ docId: 'a', localDay: '2026-01-01', activeMs: 3_600_000, pages: [1, 2] }),
      makeSession({ docId: 'a', localDay: '2026-01-02', activeMs: 3_600_000, pages: [3, 4] }),
    ];
    const result = deriveSpeed(sessions);
    expect(result.pagesPerHour).toBe(2);
    expect(result.msPerPage).toBe(1_800_000);
  });
});

describe('deriveSpeed — null cases', () => {
  it('activeMs === 0 → both null', () => {
    const sessions = [
      makeSession({ docId: 'a', localDay: '2026-01-01', activeMs: 0, pages: [1, 2] }),
    ];
    const result = deriveSpeed(sessions);
    expect(result.pagesPerHour).toBeNull();
    expect(result.msPerPage).toBeNull();
  });

  it('pagesTurned === 0 → both null', () => {
    const sessions = [
      makeSession({ docId: 'a', localDay: '2026-01-01', activeMs: 3_600_000, pages: [] }),
    ];
    const result = deriveSpeed(sessions);
    expect(result.pagesPerHour).toBeNull();
    expect(result.msPerPage).toBeNull();
  });

  it('empty sessions → both null', () => {
    const result = deriveSpeed([]);
    expect(result.pagesPerHour).toBeNull();
    expect(result.msPerPage).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. dayPartOfHour + hourOf
// ---------------------------------------------------------------------------

describe('dayPartOfHour — boundary hours', () => {
  // Night: 22-04 (22,23,0,1,2,3,4)
  it('hour 4 → night', () => expect(dayPartOfHour(4)).toBe('night'));
  it('hour 0 → night', () => expect(dayPartOfHour(0)).toBe('night'));
  it('hour 23 → night', () => expect(dayPartOfHour(23)).toBe('night'));
  it('hour 22 → night', () => expect(dayPartOfHour(22)).toBe('night'));

  // Morning: 05-11
  it('hour 5 → morning', () => expect(dayPartOfHour(5)).toBe('morning'));
  it('hour 11 → morning', () => expect(dayPartOfHour(11)).toBe('morning'));

  // Afternoon: 12-16
  it('hour 12 → afternoon', () => expect(dayPartOfHour(12)).toBe('afternoon'));
  it('hour 16 → afternoon', () => expect(dayPartOfHour(16)).toBe('afternoon'));

  // Evening: 17-21
  it('hour 17 → evening', () => expect(dayPartOfHour(17)).toBe('evening'));
  it('hour 21 → evening', () => expect(dayPartOfHour(21)).toBe('evening'));
});

describe('hourOf — tz offset shifts local hour', () => {
  it('UTC 23:00 + offset +60 min (CET) → local hour 0 (next day)', () => {
    // 2026-01-01T23:00:00Z = 23*3600*1000 ms from epoch
    const wall = Date.UTC(2026, 0, 1, 23, 0, 0);
    // +60 min offset → local time = 2026-01-02T00:00:00 → hour 0
    expect(hourOf(wall, 60)).toBe(0);
  });

  it('UTC 01:00 - offset -300 min (EST) → local hour 20 (previous day)', () => {
    // 2026-01-02T01:00:00Z
    const wall = Date.UTC(2026, 0, 2, 1, 0, 0);
    // -300 min offset → local time = 2026-01-01T20:00:00 → hour 20
    expect(hourOf(wall, -300)).toBe(20);
  });

  it('UTC 12:00 + offset 0 → local hour 12', () => {
    const wall = Date.UTC(2026, 0, 1, 12, 0, 0);
    expect(hourOf(wall, 0)).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// 4. deriveTimeOfDay
// ---------------------------------------------------------------------------

describe('deriveTimeOfDay — empty', () => {
  it('returns all-zero parts for empty sessions', () => {
    expect(deriveTimeOfDay([])).toEqual({
      morning: 0,
      afternoon: 0,
      evening: 0,
      night: 0,
    });
  });
});

describe('deriveTimeOfDay — accumulation', () => {
  it('morning session (startedAt hour 9) adds to morning', () => {
    const wall = Date.UTC(2026, 0, 1, 9, 0, 0); // 09:00 UTC → hour 9 → morning
    const session = makeSession({
      docId: 'a',
      localDay: '2026-01-01',
      startedAt: wall,
      activeMs: 3_600_000,
      tzOffsetMinutes: 0,
    });
    const result = deriveTimeOfDay([session]);
    expect(result.morning).toBe(3_600_000);
    expect(result.afternoon).toBe(0);
    expect(result.evening).toBe(0);
    expect(result.night).toBe(0);
  });

  it('two sessions in different parts accrue to correct buckets', () => {
    const morningWall = Date.UTC(2026, 0, 1, 8, 0, 0);  // hour 8 → morning
    const eveningWall = Date.UTC(2026, 0, 1, 19, 0, 0); // hour 19 → evening
    const sessions = [
      makeSession({ docId: 'a', localDay: '2026-01-01', startedAt: morningWall, activeMs: 1000, tzOffsetMinutes: 0 }),
      makeSession({ docId: 'b', localDay: '2026-01-01', startedAt: eveningWall, activeMs: 2000, tzOffsetMinutes: 0 }),
    ];
    const result = deriveTimeOfDay(sessions);
    expect(result.morning).toBe(1000);
    expect(result.evening).toBe(2000);
    expect(result.afternoon).toBe(0);
    expect(result.night).toBe(0);
  });

  it('tz offset moves a session into a different part', () => {
    // UTC 14:00 (afternoon at 0 offset) + tz +480 min (UTC+8) → local 22:00 → night
    const wall = Date.UTC(2026, 0, 1, 14, 0, 0);
    const session = makeSession({
      docId: 'a',
      localDay: '2026-01-02',
      startedAt: wall,
      activeMs: 5000,
      tzOffsetMinutes: 480,
    });
    const result = deriveTimeOfDay([session]);
    // hour = (14 + 8) % 24 = 22 → night
    expect(result.night).toBe(5000);
    expect(result.afternoon).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. buildHeatmap
// ---------------------------------------------------------------------------

describe('buildHeatmap — empty sessions', () => {
  it('dense zero-filled series for a range with no sessions', () => {
    const cells = buildHeatmap([], '2026-01-01', '2026-01-03');
    expect(cells).toHaveLength(3);
    expect(cells[0]).toEqual({ day: '2026-01-01', activeMs: 0, sessions: 0 });
    expect(cells[1]).toEqual({ day: '2026-01-02', activeMs: 0, sessions: 0 });
    expect(cells[2]).toEqual({ day: '2026-01-03', activeMs: 0, sessions: 0 });
  });
});

describe('buildHeatmap — fromDay > toDay', () => {
  it('returns [] when fromDay is after toDay', () => {
    expect(buildHeatmap([], '2026-01-05', '2026-01-01')).toEqual([]);
  });
});

describe('buildHeatmap — single day', () => {
  it('single-day range → one cell', () => {
    const session = makeSession({ docId: 'a', localDay: '2026-01-01', activeMs: 1000 });
    const cells = buildHeatmap([session], '2026-01-01', '2026-01-01');
    expect(cells).toHaveLength(1);
    expect(cells[0]).toEqual({ day: '2026-01-01', activeMs: 1000, sessions: 1 });
  });
});

describe('buildHeatmap — dense + populated', () => {
  it('correct activeMs and session count on populated days, zero on gap days', () => {
    const sessions = [
      makeSession({ docId: 'a', localDay: '2026-01-01', activeMs: 1000 }),
      makeSession({ docId: 'b', localDay: '2026-01-01', activeMs: 2000 }),
      makeSession({ docId: 'a', localDay: '2026-01-03', activeMs: 500 }),
    ];
    const cells = buildHeatmap(sessions, '2026-01-01', '2026-01-04');
    expect(cells).toHaveLength(4);
    expect(cells[0]).toEqual({ day: '2026-01-01', activeMs: 3000, sessions: 2 });
    expect(cells[1]).toEqual({ day: '2026-01-02', activeMs: 0, sessions: 0 });
    expect(cells[2]).toEqual({ day: '2026-01-03', activeMs: 500, sessions: 1 });
    expect(cells[3]).toEqual({ day: '2026-01-04', activeMs: 0, sessions: 0 });
  });

  it('sessions outside the window are not included', () => {
    const sessions = [
      makeSession({ docId: 'a', localDay: '2025-12-31', activeMs: 9999 }),
      makeSession({ docId: 'a', localDay: '2026-01-02', activeMs: 100 }),
      makeSession({ docId: 'a', localDay: '2026-01-05', activeMs: 9999 }),
    ];
    const cells = buildHeatmap(sessions, '2026-01-01', '2026-01-03');
    expect(cells).toHaveLength(3);
    expect(cells[0]).toEqual({ day: '2026-01-01', activeMs: 0, sessions: 0 });
    expect(cells[1]).toEqual({ day: '2026-01-02', activeMs: 100, sessions: 1 });
    expect(cells[2]).toEqual({ day: '2026-01-03', activeMs: 0, sessions: 0 });
  });
});

// ---------------------------------------------------------------------------
// 6. deriveBookProgress
// ---------------------------------------------------------------------------

describe('deriveBookProgress — empty', () => {
  it('returns [] for no docs', () => {
    expect(deriveBookProgress([], [], [])).toEqual([]);
  });
});

describe('deriveBookProgress — furthestPage sources', () => {
  it('position present → furthestPage from position', () => {
    const doc = makeDoc('doc1', 100);
    const position = makePosition('doc1', 42);
    const sessions = [
      makeSession({ docId: 'doc1', localDay: '2026-01-01', activeMs: 1000, pages: [1, 2, 3] }),
    ];
    const [result] = deriveBookProgress(sessions, [doc], [position]);
    expect(result!.furthestPage).toBe(42);
  });

  it('no position, sessions present → furthestPage = max session page', () => {
    const doc = makeDoc('doc1', 100);
    const sessions = [
      makeSession({ docId: 'doc1', localDay: '2026-01-01', activeMs: 1000, pages: [1, 5, 10] }),
      makeSession({ docId: 'doc1', localDay: '2026-01-02', activeMs: 1000, pages: [8, 15] }),
    ];
    const [result] = deriveBookProgress(sessions, [doc], []);
    expect(result!.furthestPage).toBe(15);
  });

  it('no position, no sessions → furthestPage 0', () => {
    const doc = makeDoc('doc1', 100);
    const [result] = deriveBookProgress([], [doc], []);
    expect(result!.furthestPage).toBe(0);
  });
});

describe('deriveBookProgress — pageCount unknown', () => {
  it('pageCount undefined → progressRatio, pagesRemaining, etaMs all null', () => {
    const doc = makeDoc('doc1'); // no pageCount
    const position = makePosition('doc1', 50);
    const sessions = [
      makeSession({ docId: 'doc1', localDay: '2026-01-01', activeMs: 3_600_000, pages: [1, 2] }),
    ];
    const [result] = deriveBookProgress(sessions, [doc], [position]);
    expect(result!.pageCount).toBeNull();
    expect(result!.progressRatio).toBeNull();
    expect(result!.pagesRemaining).toBeNull();
    expect(result!.etaMs).toBeNull();
  });
});

describe('deriveBookProgress — progress computation', () => {
  it('furthestPage < pageCount → correct ratio and pagesRemaining', () => {
    const doc = makeDoc('doc1', 200);
    const position = makePosition('doc1', 50);
    const sessions = [
      makeSession({ docId: 'doc1', localDay: '2026-01-01', activeMs: 3_600_000, pages: [1, 2] }),
    ];
    const [result] = deriveBookProgress(sessions, [doc], [position]);
    expect(result!.progressRatio).toBeCloseTo(0.25);
    expect(result!.pagesRemaining).toBe(150);
  });

  it('furthestPage >= pageCount → pagesRemaining 0, progressRatio clamped 1, etaMs 0', () => {
    const doc = makeDoc('doc1', 100);
    const position = makePosition('doc1', 120); // beyond end
    const sessions = [
      makeSession({ docId: 'doc1', localDay: '2026-01-01', activeMs: 3_600_000, pages: [1, 2] }),
    ];
    const [result] = deriveBookProgress(sessions, [doc], [position]);
    expect(result!.progressRatio).toBe(1);
    expect(result!.pagesRemaining).toBe(0);
    expect(result!.etaMs).toBe(0);
  });
});

describe('deriveBookProgress — ETA per-book vs global fallback', () => {
  it('book with own sessions uses per-book speed for ETA', () => {
    // doc1: 100 pages, at page 10 → 90 remaining
    // per-book speed: 3600000ms for 10 pages = msPerPage = 360000
    // ETA = 90 * 360000 = 32400000
    const doc = makeDoc('doc1', 100);
    const position = makePosition('doc1', 10);
    const sessions = [
      makeSession({ docId: 'doc1', localDay: '2026-01-01', activeMs: 3_600_000, pages: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }),
    ];
    const [result] = deriveBookProgress(sessions, [doc], [position]);
    expect(result!.etaMs).toBe(90 * 360_000);
  });

  it('book with no active time falls back to global msPerPage', () => {
    // doc1: has sessions and known speed (global context)
    // doc2: has pageCount but NO own sessions → falls back to global speed
    const doc1 = makeDoc('doc1', 100);
    const doc2 = makeDoc('doc2', 200);
    const pos1 = makePosition('doc1', 10);
    const pos2 = makePosition('doc2', 50);
    // doc1 sessions: 3600000ms, 10 pages → msPerPage = 360000 (this IS the global too)
    const sessions = [
      makeSession({ docId: 'doc1', localDay: '2026-01-01', activeMs: 3_600_000, pages: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }),
    ];
    const results = deriveBookProgress(sessions, [doc1, doc2], [pos1, pos2]);
    const doc2Result = results[1]!;
    // doc2 has no own sessions → falls back to global msPerPage = 360000
    // pagesRemaining = 200 - 50 = 150
    expect(doc2Result.etaMs).toBe(150 * 360_000);
  });

  it('book with no own sessions AND no global speed → etaMs null', () => {
    const doc = makeDoc('doc1', 100);
    const position = makePosition('doc1', 10);
    // sessions all have 0 activeMs → no global speed
    const sessions = [
      makeSession({ docId: 'other-doc', localDay: '2026-01-01', activeMs: 0, pages: [] }),
    ];
    const [result] = deriveBookProgress(sessions, [doc], [position]);
    expect(result!.etaMs).toBeNull();
  });

  it('per-book speed and global speed differ — assert distinct numbers', () => {
    // doc1: fast (1 page per ms effectively)
    // doc2: no own sessions → falls back to global (which mixes doc1 with a slow session)
    // global sessions include doc1 (fast) and doc3 (slow)
    const doc1 = makeDoc('doc1', 100);
    const doc2 = makeDoc('doc2', 100);
    const pos1 = makePosition('doc1', 10);
    const pos2 = makePosition('doc2', 10);
    // doc1 sessions: 3600000ms / 36 pages = 100000 ms/page
    const doc1Sessions = [
      makeSession({ docId: 'doc1', localDay: '2026-01-01', activeMs: 3_600_000, pages: Array.from({ length: 36 }, (_, i) => i + 1) }),
    ];
    // doc3 sessions (very slow): 7200000ms / 1 page = 7200000 ms/page
    const doc3Sessions = [
      makeSession({ docId: 'doc3', localDay: '2026-01-01', activeMs: 7_200_000, pages: [1] }),
    ];
    const allSessions = [...doc1Sessions, ...doc3Sessions];
    const results = deriveBookProgress(allSessions, [doc1, doc2], [pos1, pos2]);
    // doc1 uses per-book: 100000 ms/page, 90 remaining → ETA = 9_000_000
    expect(results[0]!.etaMs).toBe(90 * 100_000);
    // doc2 falls back to global: (3600000+7200000)ms / (36+1) pages
    const globalMsPerPage = (3_600_000 + 7_200_000) / 37;
    expect(results[1]!.etaMs).toBeCloseTo(90 * globalMsPerPage);
    // They should be different
    expect(results[0]!.etaMs).not.toBe(results[1]!.etaMs);
  });
});

describe('deriveBookProgress — output order', () => {
  it('one entry per doc in docs order', () => {
    const docs = [makeDoc('a', 50), makeDoc('b', 100), makeDoc('c', 200)];
    const sessions = [
      makeSession({ docId: 'b', localDay: '2026-01-01', activeMs: 1000, pages: [1] }),
      makeSession({ docId: 'c', localDay: '2026-01-01', activeMs: 2000, pages: [1, 2] }),
    ];
    const results = deriveBookProgress(sessions, docs, []);
    expect(results).toHaveLength(3);
    expect(results[0]!.docId).toBe('a');
    expect(results[1]!.docId).toBe('b');
    expect(results[2]!.docId).toBe('c');
  });
});

// ---------------------------------------------------------------------------
// 7. deriveAnalytics — composition
// ---------------------------------------------------------------------------

describe('deriveAnalytics — composition', () => {
  it('composes totals, speed, timeOfDay, books correctly', () => {
    const doc1 = makeDoc('doc1', 100);
    const doc2 = makeDoc('doc2', 200);
    const pos1 = makePosition('doc1', 25);
    const morningWall = Date.UTC(2026, 0, 1, 8, 0, 0);
    const sessions = [
      makeSession({ docId: 'doc1', localDay: '2026-01-01', startedAt: morningWall, activeMs: 3_600_000, pages: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }),
      makeSession({ docId: 'doc2', localDay: '2026-01-02', startedAt: morningWall, activeMs: 1_800_000, pages: [1, 2, 3, 4, 5] }),
    ];
    const docs = [doc1, doc2];
    const positions = [pos1];

    const summary = deriveAnalytics(sessions, docs, positions);

    // totals
    expect(summary.totals).toEqual(deriveTotals(sessions));
    // speed
    expect(summary.speed).toEqual(deriveSpeed(sessions));
    // timeOfDay
    expect(summary.timeOfDay).toEqual(deriveTimeOfDay(sessions));
    // books
    expect(summary.books).toEqual(deriveBookProgress(sessions, docs, positions));
  });
});

// ---------------------------------------------------------------------------
// 8. Purity — inputs not mutated
// ---------------------------------------------------------------------------

describe('purity — no input mutation', () => {
  it('deriveTotals does not mutate sessions', () => {
    const sessions = [makeSession({ docId: 'a', localDay: '2026-01-01', activeMs: 1000 })];
    const snapshot = JSON.stringify(sessions);
    deriveTotals(sessions);
    expect(JSON.stringify(sessions)).toBe(snapshot);
  });

  it('deriveSpeed does not mutate sessions', () => {
    const sessions = [makeSession({ docId: 'a', localDay: '2026-01-01', activeMs: 1000, pages: [1] })];
    const snapshot = JSON.stringify(sessions);
    deriveSpeed(sessions);
    expect(JSON.stringify(sessions)).toBe(snapshot);
  });

  it('buildHeatmap does not mutate sessions', () => {
    const sessions = [makeSession({ docId: 'a', localDay: '2026-01-01', activeMs: 1000 })];
    const snapshot = JSON.stringify(sessions);
    buildHeatmap(sessions, '2026-01-01', '2026-01-03');
    expect(JSON.stringify(sessions)).toBe(snapshot);
  });

  it('deriveBookProgress does not mutate sessions, docs, or positions', () => {
    const doc = makeDoc('doc1', 100);
    const position = makePosition('doc1', 10);
    const sessions = [makeSession({ docId: 'doc1', localDay: '2026-01-01', activeMs: 1000, pages: [1] })];
    const sessSnap = JSON.stringify(sessions);
    const docsSnap = JSON.stringify([doc]);
    const posSnap = JSON.stringify([position]);
    deriveBookProgress(sessions, [doc], [position]);
    expect(JSON.stringify(sessions)).toBe(sessSnap);
    expect(JSON.stringify([doc])).toBe(docsSnap);
    expect(JSON.stringify([position])).toBe(posSnap);
  });

  it('deriveAnalytics does not mutate inputs', () => {
    const doc = makeDoc('doc1', 100);
    const position = makePosition('doc1', 10);
    const sessions = [makeSession({ docId: 'doc1', localDay: '2026-01-01', activeMs: 1000, pages: [1] })];
    const sessSnap = JSON.stringify(sessions);
    const docsSnap = JSON.stringify([doc]);
    const posSnap = JSON.stringify([position]);
    deriveAnalytics(sessions, [doc], [position]);
    expect(JSON.stringify(sessions)).toBe(sessSnap);
    expect(JSON.stringify([doc])).toBe(docsSnap);
    expect(JSON.stringify([position])).toBe(posSnap);
  });
});
