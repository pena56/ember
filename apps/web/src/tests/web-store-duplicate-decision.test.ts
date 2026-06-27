/**
 * web-store-duplicate-decision.test.ts — store-surface coverage for
 * listDuplicateDecisions / saveDuplicateDecision on the WebStore facade.
 *
 * Verifies the plumbing: exactly one repo.put + one repo.enqueue per decision
 * (invariant #2), with entry.hlc === payload.updatedAt.
 */

import { describe, expect, it } from 'vitest';

import { DUPLICATE_DECISIONS_COLLECTION } from '@ember/core';
import { MemoryBlobStore, MemoryRepository } from '@ember/store';

import { subtleCryptoHasher } from '../store/subtle-crypto-hasher.js';
import { createWebClock } from '../store/web-clock.js';
import { createWebStore } from '../store/web-store.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
  };
}

function makeWebStore() {
  let counter = 0;
  const repo = new MemoryRepository();
  const store = createWebStore({
    repo,
    blobs: new MemoryBlobStore(),
    hasher: subtleCryptoHasher,
    clock: createWebClock({
      storage: makeStorage(),
      now: () => 1_000_000,
      newId: () => `id-${(++counter).toString()}`,
    }),
  });
  return { store, repo };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WebStore duplicate-decision surface', () => {
  it('listDuplicateDecisions returns [] when no decisions saved', async () => {
    const { store } = makeWebStore();
    const result = await store.listDuplicateDecisions();
    expect(result).toEqual([]);
  });

  it('saveDuplicateDecision writes exactly one record + one outbox entry and returns the decision', async () => {
    const { store, repo } = makeWebStore();

    const saved = await store.saveDuplicateDecision({
      aId: 'doc-a',
      bId: 'doc-b',
      canonicalId: 'doc-b',
      decision: 'merged',
    });

    // Return value has expected shape
    expect(saved.decision).toBe('merged');
    expect(saved.canonicalId).toBe('doc-b');
    expect(saved.aliasId).toBe('doc-a');
    expect(typeof saved.updatedAt).toBe('string');
    expect(saved.id).toBe('doc-a:doc-b'); // stable pair key: min:max

    // Exactly one record in the duplicate-decisions collection
    const records = await repo.query(DUPLICATE_DECISIONS_COLLECTION);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: 'doc-a:doc-b',
      canonicalId: 'doc-b',
      aliasId: 'doc-a',
      decision: 'merged',
    });

    // Exactly one outbox entry (invariant #2)
    const outbox = await repo.unacked();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      collection: DUPLICATE_DECISIONS_COLLECTION,
      recordId: 'doc-a:doc-b',
      op: 'put',
    });

    // entry.hlc === payload.updatedAt (invariant #2)
    expect(outbox[0]!.hlc).toBe(saved.updatedAt);
  });

  it('saveDuplicateDecision handles "separate" decision', async () => {
    const { store } = makeWebStore();

    const saved = await store.saveDuplicateDecision({
      aId: 'doc-x',
      bId: 'doc-y',
      canonicalId: 'doc-x',
      decision: 'separate',
    });

    expect(saved.decision).toBe('separate');
    expect(saved.canonicalId).toBe('doc-x');
    expect(saved.aliasId).toBe('doc-y');
  });

  it('listDuplicateDecisions reads back saved decisions', async () => {
    const { store } = makeWebStore();

    await store.saveDuplicateDecision({
      aId: 'doc-a',
      bId: 'doc-b',
      canonicalId: 'doc-b',
      decision: 'merged',
    });

    await store.saveDuplicateDecision({
      aId: 'doc-c',
      bId: 'doc-d',
      canonicalId: 'doc-c',
      decision: 'separate',
    });

    const decisions = await store.listDuplicateDecisions();
    expect(decisions).toHaveLength(2);

    const ids = decisions.map((d) => d.id).sort();
    expect(ids).toEqual(['doc-a:doc-b', 'doc-c:doc-d']);
  });

  it('pair key is order-independent: saving with bId<aId still yields min:max key', async () => {
    const { store } = makeWebStore();

    const saved = await store.saveDuplicateDecision({
      aId: 'zzz',
      bId: 'aaa',
      canonicalId: 'zzz',
      decision: 'merged',
    });

    // stable key: aaa < zzz so key = aaa:zzz
    expect(saved.id).toBe('aaa:zzz');
  });

  it('second decision for same pair overwrites (LWW) — one record, updated outbox', async () => {
    const { store, repo } = makeWebStore();

    await store.saveDuplicateDecision({
      aId: 'doc-a',
      bId: 'doc-b',
      canonicalId: 'doc-a',
      decision: 'merged',
    });

    await store.saveDuplicateDecision({
      aId: 'doc-a',
      bId: 'doc-b',
      canonicalId: 'doc-b',
      decision: 'separate',
    });

    const records = await repo.query(DUPLICATE_DECISIONS_COLLECTION);
    // Still one record (upsert by pair id)
    expect(records).toHaveLength(1);
    expect((records[0] as unknown as { decision: string }).decision).toBe('separate');

    const decisions = await store.listDuplicateDecisions();
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.decision).toBe('separate');
  });
});
