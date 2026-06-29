/**
 * run-notification-sync.test.ts — node, no native modules.
 *
 * Drives runNotificationSync with a spy NotificationPort + fake store
 * (listSessions / getGoalConfig) + injected now / tzOffsetMinutes / platform.
 *
 * Four cases (per spec §Tests):
 *  (1) registerDevice is always called first with { deviceId, platform }.
 *  (2) Goal met → no submitIntent; claimSlot('suppressed') once per type
 *      for the four ${type}:${today} keys (exact key set + via:'suppressed').
 *  (3) Goal not met + a candidate qualifies → exactly one submitIntent with
 *      the selected plan's dedupeKey/type/localDay/scheduledWall + matching
 *      notificationCopy title/body; no claimSlot.
 *  (4) Goal not met + no candidate → register only; no submitIntent, no claimSlot.
 *
 * Fixture style: fixed epochs + explicit tzOffsetMinutes, no Date.now().
 */

import { describe, expect, it, vi } from 'vitest';

import { localDayOf, notificationCopy } from '@ember/core';
import type { ReadingSession } from '@ember/core';
import type { GoalConfigRecord } from '@ember/store';

import type { NotificationPort } from './notification-port.js';
import { runNotificationSync } from './run-notification-sync.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** A fixed "now" well inside the quiet window (10:00 UTC). */
const NOW_MS = Date.parse('2025-07-15T10:00:00Z');
const TZ_UTC = 0;
const TODAY = localDayOf(NOW_MS, TZ_UTC); // '2025-07-15'

const DEVICE_ID = 'test-device-abc';
const PLATFORM = 'ios' as const;

/** Default goal config (20-min target). */
const DEFAULT_GOAL_CONFIG: GoalConfigRecord = {
  id: 'default',
  targetActiveMs: 20 * 60_000,
  updatedAt: '',
};

/** Session long enough to meet the 20-min goal. */
function goalMetSession(): ReadingSession {
  return {
    id: 'sess-1',
    docId: 'doc-1',
    localDay: TODAY,
    startedAt: NOW_MS - 25 * 60_000,
    endedAt: NOW_MS,
    activeMs: 25 * 60_000,
    tzOffsetMinutes: TZ_UTC,
    pages: [1],
    updatedAt: '',
  };
}

/** Partial session — does NOT meet goal but gives progress (5 min). */
function partialSession(): ReadingSession {
  return {
    id: 'sess-2',
    docId: 'doc-1',
    localDay: TODAY,
    startedAt: NOW_MS - 5 * 60_000,
    endedAt: NOW_MS,
    activeMs: 5 * 60_000,
    tzOffsetMinutes: TZ_UTC,
    pages: [1],
    updatedAt: '',
  };
}

// ── Port factory ──────────────────────────────────────────────────────────────

function makePort(): { port: NotificationPort; calls: string[] } {
  const calls: string[] = [];
  const port: NotificationPort = {
    registerDevice: vi.fn(async () => {
      calls.push('registerDevice');
    }),
    submitIntent: vi.fn(async () => {
      calls.push('submitIntent');
    }),
    claimSlot: vi.fn(async () => {
      calls.push('claimSlot');
    }),
  };
  return { port, calls };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('runNotificationSync', () => {
  it('(1) registerDevice is always called first with { deviceId, platform }', async () => {
    const { port } = makePort();

    await runNotificationSync({
      port,
      store: {
        listSessions: async () => [],
        getGoalConfig: async () => DEFAULT_GOAL_CONFIG,
      },
      deviceId: DEVICE_ID,
      platform: PLATFORM,
      now: NOW_MS,
      tzOffsetMinutes: TZ_UTC,
    });

    expect(port.registerDevice).toHaveBeenCalledOnce();
    expect(port.registerDevice).toHaveBeenCalledWith({ deviceId: DEVICE_ID, platform: PLATFORM });
  });

  it('(2) goal met → no submitIntent; claimSlot called once per type for four ${type}:${today} keys', async () => {
    const { port } = makePort();

    await runNotificationSync({
      port,
      store: {
        listSessions: async () => [goalMetSession()],
        getGoalConfig: async () => DEFAULT_GOAL_CONFIG,
      },
      deviceId: DEVICE_ID,
      platform: PLATFORM,
      now: NOW_MS,
      tzOffsetMinutes: TZ_UTC,
    });

    // No submitIntent when goal is met
    expect(port.submitIntent).not.toHaveBeenCalled();

    // claimSlot called exactly once per notification type
    const claimCalls = (port.claimSlot as ReturnType<typeof vi.fn>).mock.calls as [
      { dedupeKey: string; deviceId: string; via: 'suppressed' },
    ][];
    expect(claimCalls).toHaveLength(4);

    // All with via: 'suppressed' and the correct deviceId
    for (const [arg] of claimCalls) {
      expect(arg.via).toBe('suppressed');
      expect(arg.deviceId).toBe(DEVICE_ID);
    }

    // Exact key set: all four types for today
    const claimedKeys = claimCalls.map(([a]) => a.dedupeKey);
    const expectedKeys = [
      `streak-risk:${TODAY}`,
      `goal-progress:${TODAY}`,
      `best-time:${TODAY}`,
      `lapse-reengage:${TODAY}`,
    ];
    expect(claimedKeys.sort()).toEqual(expectedKeys.sort());
  });

  it('(3) goal not met + qualifying candidate → exactly one submitIntent; no claimSlot', async () => {
    const { port } = makePort();

    await runNotificationSync({
      port,
      store: {
        listSessions: async () => [partialSession()],
        getGoalConfig: async () => DEFAULT_GOAL_CONFIG,
      },
      deviceId: DEVICE_ID,
      platform: PLATFORM,
      now: NOW_MS,
      tzOffsetMinutes: TZ_UTC,
    });

    // No suppress slots when goal is not met
    expect(port.claimSlot).not.toHaveBeenCalled();

    // Exactly one submitIntent
    expect(port.submitIntent).toHaveBeenCalledOnce();

    const [intentArg] = (port.submitIntent as ReturnType<typeof vi.fn>).mock.calls[0] as [
      {
        deviceId: string;
        dedupeKey: string;
        type: string;
        localDay: string;
        scheduledWall: number;
        title: string;
        body: string;
      },
    ];

    // Core plan fields
    expect(intentArg.deviceId).toBe(DEVICE_ID);
    expect(intentArg.localDay).toBe(TODAY);
    expect(intentArg.dedupeKey).toBe(`${intentArg.type}:${intentArg.localDay}`);
    expect(typeof intentArg.scheduledWall).toBe('number');

    // Copy matches notificationCopy for the selected type
    const copy = notificationCopy(intentArg.type as Parameters<typeof notificationCopy>[0]);
    expect(intentArg.title).toBe(copy.title);
    expect(intentArg.body).toBe(copy.body);
  });

  it('(4) goal not met + no qualifying candidate → register only; no submitIntent, no claimSlot', async () => {
    const { port } = makePort();

    // Produce a "no candidate" state by making learnBestHour return hour 3 (outside
    // quiet window [8, 22)), which filters out the best-time candidate. Provide 5
    // sessions (>= bestTimeMinSessions default of 5) all starting at 03:00 UTC on
    // 2025-07-13 (2 days before today 2025-07-15). This ensures:
    //  - learnBestHour → 3 (outside quiet) → best-time filtered out
    //  - goal.activeMs = 0 (no session today) → no goal-progress
    //  - streak.current = 0 (streak broken after 2025-07-13) → no streak-risk
    //  - daysBetween('2025-07-13', '2025-07-15') = 2 < lapseDays(3) → no lapse-reengage
    const PAST_DAY = '2025-07-13';
    const sessionsAt3am: ReadingSession[] = Array.from({ length: 5 }, (_, i) => ({
      id: `sess-early-${i}`,
      docId: 'doc-1',
      localDay: PAST_DAY,
      startedAt: Date.parse('2025-07-13T03:00:00Z') + i * 60_000,
      endedAt: Date.parse('2025-07-13T03:10:00Z') + i * 60_000,
      activeMs: 10 * 60_000,
      tzOffsetMinutes: TZ_UTC,
      pages: [1],
      updatedAt: '',
    }));

    await runNotificationSync({
      port,
      store: {
        listSessions: async () => sessionsAt3am,
        getGoalConfig: async () => DEFAULT_GOAL_CONFIG,
      },
      deviceId: DEVICE_ID,
      platform: PLATFORM,
      now: NOW_MS, // 2025-07-15T10:00:00Z
      tzOffsetMinutes: TZ_UTC,
    });

    // registerDevice still called
    expect(port.registerDevice).toHaveBeenCalledOnce();
    expect(port.registerDevice).toHaveBeenCalledWith({ deviceId: DEVICE_ID, platform: PLATFORM });

    // No intents or claims
    expect(port.submitIntent).not.toHaveBeenCalled();
    expect(port.claimSlot).not.toHaveBeenCalled();
  });
});
