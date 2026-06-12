/**
 * web-store-session.test.ts — store-surface coverage for recordSession on the
 * WebStore facade.
 *
 * Mirrors web-store-reading-position.test.ts: MemoryRepository + MemoryBlobStore +
 * injected createWebClock confirm correct plumbing (delegate to @ember/store with
 * the right id factories / HLC stamp).
 */

import { describe, expect, it } from 'vitest';

import type { FlushedSession } from '@ember/core';
import { MemoryBlobStore, MemoryRepository, SESSIONS_COLLECTION } from '@ember/store';

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
  let wall = 1_000_000;
  const repo = new MemoryRepository();
  const store = createWebStore({
    repo,
    blobs: new MemoryBlobStore(),
    hasher: subtleCryptoHasher,
    clock: createWebClock({
      storage: makeStorage(),
      now: () => wall++, // strictly increasing so HLC advances
      newId: () => `id-${(++counter).toString()}`,
    }),
  });
  return { store, repo };
}

const flushed1: FlushedSession = {
  docId: 'doc-abc',
  localDay: '2026-06-12',
  tzOffsetMinutes: 60,
  startedAt: 1_749_686_400_000,
  endedAt: 1_749_686_445_000,
  activeMs: 45_000,
  pages: [1, 2, 3],
};

const flushed2: FlushedSession = {
  docId: 'doc-abc',
  localDay: '2026-06-12',
  tzOffsetMinutes: 60,
  startedAt: 1_749_686_500_000,
  endedAt: 1_749_686_530_000,
  activeMs: 30_000,
  pages: [3, 4],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WebStore recordSession surface', () => {
  it('writes exactly one sessions record (uuid id, not docId) + one outbox entry per call', async () => {
    const { store, repo } = makeWebStore();

    const session = await store.recordSession(flushed1);

    // Return value has a fresh uuid id (not docId), full session shape
    expect(session.id).not.toBe(flushed1.docId);
    expect(typeof session.id).toBe('string');
    expect(session.docId).toBe(flushed1.docId);
    expect(session.activeMs).toBe(45_000);
    expect(session.pages).toEqual([1, 2, 3]);
    expect(typeof session.updatedAt).toBe('string');

    // Exactly one record in the sessions collection
    const records = await repo.query(SESSIONS_COLLECTION);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: session.id, docId: 'doc-abc' });

    // Exactly one outbox entry
    const outbox = await repo.unacked();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      collection: SESSIONS_COLLECTION,
      recordId: session.id,
      op: 'put',
    });

    // Payload deep-equals the returned session
    expect((outbox[0]!.payload as typeof session)).toMatchObject({
      id: session.id,
      docId: session.docId,
      activeMs: session.activeMs,
    });
  });

  it('two calls append two distinct records (no overwrite); updatedAt strings are monotonic', async () => {
    const { store, repo } = makeWebStore();

    const s1 = await store.recordSession(flushed1);
    const s2 = await store.recordSession(flushed2);

    // Distinct ids (uuid, not docId)
    expect(s1.id).not.toBe(s2.id);
    expect(s1.id).not.toBe(flushed1.docId);
    expect(s2.id).not.toBe(flushed2.docId);

    // Both records present — append-only
    const records = await repo.query(SESSIONS_COLLECTION);
    expect(records).toHaveLength(2);

    // updatedAt is monotonic (HLC is strictly increasing)
    expect(s2.updatedAt > s1.updatedAt).toBe(true);

    // Outbox has two entries
    const outbox = await repo.unacked();
    expect(outbox).toHaveLength(2);
    const recordIds = outbox.map((e) => e.recordId).sort();
    expect(recordIds).toContain(s1.id);
    expect(recordIds).toContain(s2.id);
  });
});
