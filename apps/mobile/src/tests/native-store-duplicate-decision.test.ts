/**
 * native-store-duplicate-decision.test.ts — seam tests for listDuplicateDecisions
 * and saveDuplicateDecision on the NativeStore (14c).
 *
 * Asserts:
 *   - exactly-one-record + exactly-one-outbox-entry per decision
 *   - entry.hlc === saved.updatedAt (invariant #2: same HLC stamp)
 *   - listDuplicateDecisions reads back saved records
 */

import { describe, expect, it } from 'vitest';

import type { Hasher } from '@ember/core';
import { DUPLICATE_DECISIONS_COLLECTION } from '@ember/core';
import { MemoryBlobStore, MemoryRepository } from '@ember/store';

import { createNativeClock } from '../store/native-clock.js';
import { createNativeStore } from '../store/native-store.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStorage(): { getItem(k: string): string | null; setItem(k: string, v: string): void } {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); },
  };
}

let counter = 0;
let wall = 1_000_000;
const fakeNewId = () => `id-${(++counter).toString()}`;

const fakeHasher: Hasher = {
  async sha256Hex(bytes: Uint8Array): Promise<string> {
    const sum = bytes.reduce((a, b) => a + b, 0);
    return sum.toString(16).padStart(64, '0');
  },
};

function makeDeps() {
  counter = 0;
  wall = 1_000_000;
  const repo = new MemoryRepository();
  const blobs = new MemoryBlobStore();
  const clock = createNativeClock({
    storage: makeStorage(),
    now: () => wall++,
    newId: fakeNewId,
  });
  const store = createNativeStore({ repo, blobs, hasher: fakeHasher, clock });
  return { store, repo };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NativeStore duplicate-decision surface (14c)', () => {
  it('listDuplicateDecisions returns [] when no decisions stored', async () => {
    const { store } = makeDeps();
    const decisions = await store.listDuplicateDecisions();
    expect(decisions).toEqual([]);
  });

  it('saveDuplicateDecision returns a valid DuplicateDecision', async () => {
    const { store } = makeDeps();
    const rec = await store.saveDuplicateDecision({
      aId: 'doc-a',
      bId: 'doc-b',
      canonicalId: 'doc-a',
      decision: 'merged',
    });

    expect(rec.id).toBe('doc-a:doc-b'); // stable pair key aId < bId
    expect(rec.canonicalId).toBe('doc-a');
    expect(rec.aliasId).toBe('doc-b');
    expect(rec.decision).toBe('merged');
    expect(typeof rec.updatedAt).toBe('string');
    expect(rec.updatedAt.length).toBeGreaterThan(0);
  });

  it('saveDuplicateDecision writes exactly one record (invariant #2)', async () => {
    const { store, repo } = makeDeps();
    await store.saveDuplicateDecision({
      aId: 'doc-a',
      bId: 'doc-b',
      canonicalId: 'doc-a',
      decision: 'merged',
    });

    const records = await repo.query(DUPLICATE_DECISIONS_COLLECTION);
    expect(records).toHaveLength(1);
  });

  it('saveDuplicateDecision writes exactly one outbox entry (invariant #2)', async () => {
    const { store, repo } = makeDeps();
    await store.saveDuplicateDecision({
      aId: 'doc-a',
      bId: 'doc-b',
      canonicalId: 'doc-a',
      decision: 'merged',
    });

    const outbox = await repo.unacked();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.collection).toBe(DUPLICATE_DECISIONS_COLLECTION);
    expect(outbox[0]!.op).toBe('put');
  });

  it('entry.hlc === saved.updatedAt (same HLC stamp, invariant #2)', async () => {
    const { store, repo } = makeDeps();
    const rec = await store.saveDuplicateDecision({
      aId: 'doc-a',
      bId: 'doc-b',
      canonicalId: 'doc-b',
      decision: 'merged',
    });

    const outbox = await repo.unacked();
    expect(outbox).toHaveLength(1);
    // The outbox entry hlc must equal the record's updatedAt (ONE nextStamp() call)
    expect(outbox[0]!.hlc).toBe(rec.updatedAt);
  });

  it('listDuplicateDecisions reads back saved decisions', async () => {
    const { store } = makeDeps();
    await store.saveDuplicateDecision({
      aId: 'doc-a',
      bId: 'doc-b',
      canonicalId: 'doc-a',
      decision: 'merged',
    });

    const decisions = await store.listDuplicateDecisions();
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.id).toBe('doc-a:doc-b');
    expect(decisions[0]!.canonicalId).toBe('doc-a');
    expect(decisions[0]!.decision).toBe('merged');
  });

  it('saveDuplicateDecision with separate decision stores correctly', async () => {
    const { store } = makeDeps();
    const rec = await store.saveDuplicateDecision({
      aId: 'doc-a',
      bId: 'doc-b',
      canonicalId: 'doc-a',
      decision: 'separate',
    });

    expect(rec.decision).toBe('separate');
    const decisions = await store.listDuplicateDecisions();
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.decision).toBe('separate');
  });

  it('second decision for same pair upserts (LWW — one record)', async () => {
    const { store, repo } = makeDeps();
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

    // Record upserts to one (same stable pair key)
    const records = await repo.query(DUPLICATE_DECISIONS_COLLECTION);
    expect(records).toHaveLength(1);
    // Two outbox entries (one per decision write)
    const outbox = await repo.unacked();
    expect(outbox).toHaveLength(2);
  });

  it('outbox entry recordId matches the decision record id', async () => {
    const { store, repo } = makeDeps();
    const rec = await store.saveDuplicateDecision({
      aId: 'doc-a',
      bId: 'doc-b',
      canonicalId: 'doc-a',
      decision: 'merged',
    });

    const outbox = await repo.unacked();
    expect(outbox[0]!.recordId).toBe(rec.id);
  });
});
