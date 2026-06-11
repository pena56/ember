/**
 * web-store-reading-position.test.ts — store-surface coverage for
 * saveReadingPosition / getReadingPosition on the WebStore facade.
 *
 * These are thin wrappers over the already-tested 06a layer; the tests here
 * confirm the plumbing (WebStore correctly delegates to @ember/store with the
 * right clock/repo) rather than re-testing the core logic.
 */

import { describe, expect, it } from 'vitest';

import { MemoryBlobStore, MemoryRepository, READING_POSITIONS_COLLECTION } from '@ember/store';

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

describe('WebStore reading-position surface', () => {
  it('saveReadingPosition writes one record + one outbox entry and getReadingPosition reads it back', async () => {
    const { store, repo } = makeWebStore();
    const docId = 'abc123';

    const saved = await store.saveReadingPosition({ docId, page: 7, offset: 0.4 });

    // Return value matches input (after guards)
    expect(saved.id).toBe(docId);
    expect(saved.page).toBe(7);
    expect(saved.offset).toBeCloseTo(0.4);
    expect(typeof saved.updatedAt).toBe('string');

    // Exactly one record in the reading-positions collection
    const records = await repo.query(READING_POSITIONS_COLLECTION);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: docId, page: 7 });

    // Exactly one outbox entry
    const outbox = await repo.unacked();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      collection: READING_POSITIONS_COLLECTION,
      recordId: docId,
      op: 'put',
    });

    // getReadingPosition reads it back
    const read = await store.getReadingPosition(docId);
    expect(read).toBeDefined();
    expect(read!.id).toBe(docId);
    expect(read!.page).toBe(7);
  });

  it('getReadingPosition returns undefined for an unknown docId', async () => {
    const { store } = makeWebStore();
    const result = await store.getReadingPosition('nonexistent-doc');
    expect(result).toBeUndefined();
  });

  it('last-write: re-saving with a lower page replaces the stored record', async () => {
    const { store } = makeWebStore();
    const docId = 'doc-last-write';

    await store.saveReadingPosition({ docId, page: 50, offset: 0.8 });
    await store.saveReadingPosition({ docId, page: 10, offset: 0.1 });

    const read = await store.getReadingPosition(docId);
    expect(read?.page).toBe(10);
  });
});
