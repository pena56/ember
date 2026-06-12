/**
 * session-tracker.test.ts — pure unit tests for the mobile createSessionTracker.
 *
 * All timing is fake (injected now / tzOffset); no native modules needed.
 * Reducer math is tested here; the hook (use-session-tracking.ts) is device-
 * verified in Expo Go (no headless RN renderer exists in this project).
 *
 * Adapted from apps/web/src/reader/session-tracker.test.ts — same suite,
 * same import path convention.
 */

import { describe, expect, it } from 'vitest';

import type { FlushedSession } from '@ember/core';

import { createSessionTracker } from '../reader/session-tracker.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TZ = 60; // +60 minutes (e.g. CET)

// Use a fixed base timestamp that maps to 2026-06-12 in TZ=60 offset.
// 2026-06-12T00:00:00Z in UTC = wall 1749686400000
// With tzOffset +60 min, local midnight = wall - 60*60_000 = 1749682800000
const BASE_MS = 1_749_686_400_000; // 2026-06-12T00:00:00Z

function makeTracker(onFlush: (f: FlushedSession) => void) {
  let t = BASE_MS;
  const now = () => t;
  const tzOffset = () => TZ;
  const advance = (ms: number) => { t += ms; };
  const tracker = createSessionTracker({ now, tzOffset, onFlush });
  return { tracker, advance };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createSessionTracker', () => {
  it('accrual: open + 3×15s activity + close → one flush with activeMs=45000', () => {
    const flushed: FlushedSession[] = [];
    const { tracker, advance } = makeTracker((f) => { flushed.push(f); });

    tracker.open('doc-1', 3);
    advance(15_000);
    tracker.activity();
    advance(15_000);
    tracker.activity();
    advance(15_000);
    tracker.activity();
    tracker.close();

    expect(flushed).toHaveLength(1);
    const s = flushed[0]!;
    expect(s.activeMs).toBe(45_000);
    expect(s.docId).toBe('doc-1');
    expect(s.pages).toEqual([3]);
    expect(s.tzOffsetMinutes).toBe(TZ);
    expect(s.startedAt).toBe(BASE_MS);
    expect(s.endedAt).toBe(BASE_MS + 45_000);
  });

  it('idle split: gap 90s → flushes first bout on the 2nd activity; close drops zero-active second bout', () => {
    const flushed: FlushedSession[] = [];
    const { tracker, advance } = makeTracker((f) => { flushed.push(f); });

    tracker.open('doc-2', 1);
    advance(30_000);
    tracker.activity(); // accrues 30s
    advance(90_000);    // gap > 60s idle threshold
    tracker.activity(); // flushes first bout (activeMs=30000), starts fresh

    // First bout should have been flushed at this point
    expect(flushed).toHaveLength(1);
    expect(flushed[0]!.activeMs).toBe(30_000);

    // close drops the zero-active second bout
    tracker.close();
    expect(flushed).toHaveLength(1); // still 1 — no second flush
  });

  it('page events accumulate distinct ascending pages and advance active time; repeat page no dup', () => {
    const flushed: FlushedSession[] = [];
    const { tracker, advance } = makeTracker((f) => { flushed.push(f); });

    tracker.open('doc-3', 1);
    advance(10_000);
    tracker.page(2);
    advance(10_000);
    tracker.page(3);
    advance(10_000);
    tracker.page(2); // repeat — should not dup
    tracker.close();

    expect(flushed).toHaveLength(1);
    const s = flushed[0]!;
    expect(s.pages).toEqual([1, 2, 3]);
    expect(s.activeMs).toBe(30_000); // 3 × 10s gaps
  });

  it('open-over-open: second open flushes A (if active) then tracks B', () => {
    const flushed: FlushedSession[] = [];
    const { tracker, advance } = makeTracker((f) => { flushed.push(f); });

    tracker.open('doc-A', 1);
    advance(20_000);
    tracker.activity(); // accrues 20s for A
    tracker.open('doc-B', 5); // should flush A

    expect(flushed).toHaveLength(1);
    expect(flushed[0]!.docId).toBe('doc-A');
    expect(flushed[0]!.activeMs).toBe(20_000);

    advance(10_000);
    tracker.activity();
    tracker.close(); // flushes B

    expect(flushed).toHaveLength(2);
    expect(flushed[1]!.docId).toBe('doc-B');
    expect(flushed[1]!.activeMs).toBe(10_000);
  });

  it('close on empty state → no flush', () => {
    const flushed: FlushedSession[] = [];
    const { tracker } = makeTracker((f) => { flushed.push(f); });

    tracker.close();
    expect(flushed).toHaveLength(0);
  });

  it('double close → no extra flush', () => {
    const flushed: FlushedSession[] = [];
    const { tracker, advance } = makeTracker((f) => { flushed.push(f); });

    tracker.open('doc-x', 1);
    advance(15_000);
    tracker.activity();
    tracker.close();
    expect(flushed).toHaveLength(1);
    tracker.close(); // second close — already empty
    expect(flushed).toHaveLength(1); // no extra
  });

  it('multi-flush ordering: idle split + close → two flushes in order', () => {
    const flushed: FlushedSession[] = [];
    const { tracker, advance } = makeTracker((f) => { flushed.push(f); });

    tracker.open('doc-m', 1);
    advance(15_000);
    tracker.activity(); // accrues 15s
    advance(90_000);   // idle gap — next activity will flush first bout
    tracker.activity(); // flush bout-1 (activeMs=15000); start bout-2
    advance(20_000);
    tracker.activity(); // accrues 20s in bout-2
    tracker.close();   // flush bout-2

    expect(flushed).toHaveLength(2);
    expect(flushed[0]!.activeMs).toBe(15_000);
    expect(flushed[1]!.activeMs).toBe(20_000);
    // Ordering: bout-1 before bout-2
    expect(flushed[0]!.startedAt).toBeLessThan(flushed[1]!.startedAt);
  });

  it('onFlush receives injected tzOffsetMinutes', () => {
    const flushed: FlushedSession[] = [];
    let t = BASE_MS;
    const tracker = createSessionTracker({
      now: () => t,
      tzOffset: () => -300, // EST
      onFlush: (f) => { flushed.push(f); },
    });

    tracker.open('doc-tz', 1);
    t += 15_000;
    tracker.activity();
    tracker.close();

    expect(flushed).toHaveLength(1);
    expect(flushed[0]!.tzOffsetMinutes).toBe(-300);
  });
});
