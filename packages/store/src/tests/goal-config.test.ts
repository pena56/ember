// goal-config.test.ts — tests for getGoalConfig / setGoalConfig.
// Uses MemoryRepository + fixed Hlc (mirrors sessions.test.ts pattern).

import { describe, expect, it } from 'vitest';

import { DEFAULT_GOAL_ACTIVE_MS, encode, initialClock, tick } from '@ember/core';

import {
  GOAL_CONFIG_COLLECTION,
  GOAL_CONFIG_ID,
  getGoalConfig,
  setGoalConfig,
} from '../goal-config.js';
import { MemoryRepository } from '../memory-repository.js';

// ---------------------------------------------------------------------------
// Test harness (mirrors sessions.test.ts)
// ---------------------------------------------------------------------------

function makeTestDeps() {
  const repo = new MemoryRepository();
  const hlc = tick(initialClock('test-node'), 1_000_000);
  let outboxCounter = 0;
  const newOutboxId = () => `outbox-${++outboxCounter}`;
  return { repo, hlc, newOutboxId };
}

// ---------------------------------------------------------------------------
// getGoalConfig — default when nothing stored
// ---------------------------------------------------------------------------

describe('getGoalConfig — default', () => {
  it('returns DEFAULT_GOAL_ACTIVE_MS and empty updatedAt when nothing stored', async () => {
    const { repo } = makeTestDeps();
    const result = await getGoalConfig(repo);
    expect(result.id).toBe(GOAL_CONFIG_ID);
    expect(result.targetActiveMs).toBe(DEFAULT_GOAL_ACTIVE_MS);
    expect(result.updatedAt).toBe('');
  });
});

// ---------------------------------------------------------------------------
// setGoalConfig — writes one record + one outbox entry
// ---------------------------------------------------------------------------

describe('setGoalConfig', () => {
  it('writes exactly one record (id "default") + exactly one outbox entry (op put, recordId "default")', async () => {
    const deps = makeTestDeps();
    const targetMs = 30 * 60_000; // 30 min

    const record = await setGoalConfig(deps, targetMs);

    // Record shape
    expect(record.id).toBe(GOAL_CONFIG_ID);
    expect(record.targetActiveMs).toBe(targetMs);
    expect(record.updatedAt).toBe(encode(deps.hlc));

    // One record stored
    const stored = await deps.repo.get(GOAL_CONFIG_COLLECTION, GOAL_CONFIG_ID);
    expect(stored).toEqual(record);

    // Exactly one outbox entry
    const entries = await deps.repo.unacked();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.op).toBe('put');
    expect(entries[0]!.recordId).toBe(GOAL_CONFIG_ID);
    expect(entries[0]!.collection).toBe(GOAL_CONFIG_COLLECTION);
    expect(entries[0]!.payload).toEqual(record);
  });

  it('getGoalConfig after set returns the stored value', async () => {
    const deps = makeTestDeps();
    const targetMs = 15 * 60_000;

    await setGoalConfig(deps, targetMs);
    const result = await getGoalConfig(deps.repo);

    expect(result.targetActiveMs).toBe(targetMs);
    expect(result.id).toBe(GOAL_CONFIG_ID);
  });

  it('set twice → still single goalConfig record (overwritten), two outbox entries', async () => {
    const deps = makeTestDeps();

    await setGoalConfig(deps, 10 * 60_000);
    await setGoalConfig(deps, 25 * 60_000);

    // Only one record in the collection
    const allRecords = await deps.repo.query(GOAL_CONFIG_COLLECTION);
    expect(allRecords).toHaveLength(1);
    expect((allRecords[0] as unknown as { targetActiveMs: number }).targetActiveMs).toBe(25 * 60_000);

    // Two outbox entries (mutation log — append only)
    const entries = await deps.repo.unacked();
    expect(entries).toHaveLength(2);
  });

  it('clamps below-floor target (e.g. 1_000 ms) to 60_000 ms (1 min floor)', async () => {
    const deps = makeTestDeps();
    const record = await setGoalConfig(deps, 1_000);
    expect(record.targetActiveMs).toBe(60_000);

    const stored = await deps.repo.get(GOAL_CONFIG_COLLECTION, GOAL_CONFIG_ID);
    expect((stored as unknown as { targetActiveMs: number }).targetActiveMs).toBe(60_000);
  });

  it('updatedAt equals encode(hlc)', async () => {
    const deps = makeTestDeps();
    const record = await setGoalConfig(deps, DEFAULT_GOAL_ACTIVE_MS);
    expect(record.updatedAt).toBe(encode(deps.hlc));
  });
});
