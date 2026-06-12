// goal-config.ts — get/set the user's daily reading-goal target.
// Mutable settings record (not a session aggregate — invariant #3 governs derived stats,
// not config). Single record per user; cross-device conflicts resolve via HLC updatedAt
// in the unit-12 reconciler (last-write-wins).

import {
  DEFAULT_GOAL_ACTIVE_MS,
  type Hlc,
  encode,
  makeOutboxEntry,
} from '@ember/core';

import type { Repository } from './repository.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const GOAL_CONFIG_COLLECTION = 'goalConfig';
export const GOAL_CONFIG_ID = 'default';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GoalConfigRecord = {
  id: string;
  targetActiveMs: number;
  /** Encoded HLC stamp — lexicographic sort agrees with compare. Empty string for the unpersisted default. */
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// getGoalConfig
// ---------------------------------------------------------------------------

/**
 * Fetch the stored GoalConfigRecord, or return an unpersisted default when nothing is stored.
 *
 * The default has `updatedAt: ''` so any real `setGoalConfig` call always wins by HLC compare
 * (an encoded HLC sorts higher than the empty string).
 */
export async function getGoalConfig(repo: Repository): Promise<GoalConfigRecord> {
  const stored = await repo.get<GoalConfigRecord>(GOAL_CONFIG_COLLECTION, GOAL_CONFIG_ID);
  if (stored !== undefined) return stored;
  return {
    id: GOAL_CONFIG_ID,
    targetActiveMs: DEFAULT_GOAL_ACTIVE_MS,
    updatedAt: '',
  };
}

// ---------------------------------------------------------------------------
// setGoalConfig
// ---------------------------------------------------------------------------

/**
 * Persist the user's daily-goal target and enqueue one HLC-stamped outbox entry (invariant #2).
 *
 * - Clamps `targetActiveMs` to a minimum of 60_000 ms (1 minute floor; sanity guard).
 * - Integer ms (Math.trunc).
 * - Overwrites the single 'default' record (settings mutability — not a session).
 * - Exactly one outbox entry per call (mutation-log append — two calls → two entries).
 */
export async function setGoalConfig(
  deps: { repo: Repository; hlc: Hlc; newOutboxId: () => string },
  targetActiveMs: number,
): Promise<GoalConfigRecord> {
  const target = Math.max(60_000, Math.trunc(targetActiveMs));

  const record: GoalConfigRecord = {
    id: GOAL_CONFIG_ID,
    targetActiveMs: target,
    updatedAt: encode(deps.hlc),
  };

  await deps.repo.put(GOAL_CONFIG_COLLECTION, record);

  await deps.repo.enqueue(
    makeOutboxEntry({
      id: deps.newOutboxId(),
      hlc: deps.hlc,
      collection: GOAL_CONFIG_COLLECTION,
      recordId: GOAL_CONFIG_ID,
      op: 'put',
      payload: record,
    }),
  );

  return record;
}
