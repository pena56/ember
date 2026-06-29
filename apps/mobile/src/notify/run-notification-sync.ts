/**
 * run-notification-sync.ts — pure-ish, node-tested orchestration.
 *
 * Mobile analog of web's inline run() steps, extracted so it is testable
 * with no native modules. Caller injects now / tz / platform — no clock or
 * platform calls inside (invariant #1: @ember/core is clock-free; callers own time).
 *
 * No try/catch here — the scheduler swallows (local-first).
 *
 * Invariants:
 *  - #1 All reads are local (store.listSessions / getGoalConfig); only writes
 *    (registerDevice / submitIntent / claimSlot) touch Convex.
 *  - #2 Notification calls are direct authed calls — NOT outbox.
 *  - #5 Zero decision logic reinvented — all planning defers to deriveNotificationSync
 *    from @ember/core (16d hoist).
 *  - #7 Submit one + suppress; server ledger elects / dedupes. Mobile never
 *    elects or fires locally.
 */

import { deriveNotificationSync } from '@ember/core';
import type { ReadingSession } from '@ember/core';
import type { GoalConfigRecord } from '@ember/store';

import type { NotificationPort } from './notification-port.js';

export interface RunNotificationSyncDeps {
  port: NotificationPort;
  store: {
    listSessions(): Promise<ReadingSession[]>;
    getGoalConfig(): Promise<GoalConfigRecord>;
  };
  deviceId: string;
  platform: 'ios' | 'android';
  now: number;
  tzOffsetMinutes: number;
}

export async function runNotificationSync(deps: RunNotificationSyncDeps): Promise<void> {
  const { port, store, deviceId, platform, now, tzOffsetMinutes } = deps;
  // 1. Register device (no token) + liveness heartbeat.
  await port.registerDevice({ deviceId, platform });
  // 2. Read sessions + goal config (all local — invariant #1).
  const sessions = await store.listSessions();
  const goalConfig = await store.getGoalConfig();
  // 3. Derive via 16a's engine (pure, hoisted to core in 16d).
  const { intent, suppress } = deriveNotificationSync({
    sessions, now, tzOffsetMinutes,
    config: { goalTargetMs: goalConfig.targetActiveMs },
  });
  // 4. Submit the single selected intent, if any.
  if (intent) {
    await port.submitIntent({
      deviceId,
      dedupeKey: intent.plan.dedupeKey,
      type: intent.plan.type,
      localDay: intent.plan.localDay,
      scheduledWall: intent.plan.scheduledWall,
      title: intent.title,
      body: intent.body,
    });
  }
  // 5. Claim suppressed slots (goal met — block every device from nudging).
  for (const key of suppress) {
    await port.claimSlot({ dedupeKey: key, deviceId, via: 'suppressed' });
  }
}
