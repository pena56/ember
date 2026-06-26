/**
 * native-store-blob-status.test.ts — listBlobStatuses() is read-only.
 *
 * Verifies:
 *  (1) listBlobStatuses returns records put via blobStatus.put.
 *  (2) listBlobStatuses is read-only — no outbox entry is written when called.
 *  (3) returns empty array when no records exist.
 */

import { describe, expect, it } from 'vitest';

import type { BlobStatus, Hasher } from '@ember/core';
import { BLOB_SYNC_COLLECTION } from '@ember/core';
import { MemoryBlobStore, MemoryRepository } from '@ember/store';

import { createNativeClock } from '../store/native-clock.js';
import { createNativeStore } from '../store/native-store.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

let counter = 0;
const fakeNewId = () => `id-${(++counter).toString()}`;

const fakeHasher: Hasher = {
  async sha256Hex(bytes: Uint8Array): Promise<string> {
    const sum = bytes.reduce((a, b) => a + b, 0);
    return sum.toString(16).padStart(64, '0');
  },
};

function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
  };
}

function makeDeps() {
  counter = 0;
  const repo = new MemoryRepository();
  const blobs = new MemoryBlobStore();
  const clock = createNativeClock({
    storage: makeStorage(),
    now: () => Date.now(),
    newId: fakeNewId,
  });
  const store = createNativeStore({ repo, blobs, hasher: fakeHasher, clock });
  return { store, repo };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('listBlobStatuses', () => {
  it('(1) returns records put via repo.put in the blob-sync collection', async () => {
    const { store, repo } = makeDeps();

    const status1: BlobStatus = { id: 'doc-a', status: 'synced' };
    const status2: BlobStatus = { id: 'doc-b', status: 'deferred', code: 'over-file-cap' };

    await repo.put(BLOB_SYNC_COLLECTION, status1);
    await repo.put(BLOB_SYNC_COLLECTION, status2);

    const results = await store.listBlobStatuses();

    expect(results).toHaveLength(2);
    expect(results).toContainEqual(status1);
    expect(results).toContainEqual(status2);
  });

  it('(2) is read-only — calling listBlobStatuses writes no outbox entry', async () => {
    const { store, repo } = makeDeps();

    const status: BlobStatus = { id: 'doc-c', status: 'synced' };
    await repo.put(BLOB_SYNC_COLLECTION, status);

    const outboxBefore = (await repo.unacked()).length;

    await store.listBlobStatuses();

    const outboxAfter = (await repo.unacked()).length;
    expect(outboxAfter).toBe(outboxBefore);
  });

  it('(3) returns empty array when no blob-status records exist', async () => {
    const { store } = makeDeps();
    const results = await store.listBlobStatuses();
    expect(results).toEqual([]);
  });
});
