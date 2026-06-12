/**
 * native-store-reading-position.test.ts — thin seam test for saveReadingPosition /
 * getReadingPosition on the NativeStore wrapper.
 *
 * Mirrors native-store.test.ts structure: MemoryRepository + MemoryBlobStore +
 * fake Hasher + injected clock. We assert the seam (one record + one outbox entry),
 * NOT the 06a internals that are already tested in packages/store.
 */

import { describe, expect, it } from 'vitest';

import type { Hasher } from '@ember/core';
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
const fakeNewId = () => `id-${(++counter).toString()}`;

const fakeHasher: Hasher = {
  async sha256Hex(bytes: Uint8Array): Promise<string> {
    const sum = bytes.reduce((a, b) => a + b, 0);
    return sum.toString(16).padStart(64, '0');
  },
};

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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('saveReadingPosition', () => {
  it('writes exactly one ReadingPosition record + one HLC-stamped outbox entry', async () => {
    const { store, repo } = makeDeps();
    const docId = 'doc-abc';

    const pos = await store.saveReadingPosition({ docId, page: 5, offset: 0.25 });

    expect(pos.id).toBe(docId);
    expect(pos.page).toBe(5);
    expect(pos.offset).toBe(0.25);
    expect(typeof pos.updatedAt).toBe('string');
    expect(pos.updatedAt.length).toBeGreaterThan(0);

    // Exactly one outbox entry — invariant #2
    const outbox = await repo.unacked();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.recordId).toBe(docId);
    expect(outbox[0]!.op).toBe('put');
    expect(typeof outbox[0]!.hlc).toBe('string');
    expect(outbox[0]!.hlc.length).toBeGreaterThan(0);
  });

  it('getReadingPosition reads back the saved position', async () => {
    const { store } = makeDeps();
    const docId = 'doc-xyz';

    await store.saveReadingPosition({ docId, page: 3, offset: 0.5 });
    const result = await store.getReadingPosition(docId);

    expect(result).toBeDefined();
    expect(result!.id).toBe(docId);
    expect(result!.page).toBe(3);
    expect(result!.offset).toBe(0.5);
  });

  it('last-write wins, not furthest — save page 50 then page 10 → reads page 10', async () => {
    const { store, repo } = makeDeps();
    const docId = 'doc-last-write';

    await store.saveReadingPosition({ docId, page: 50, offset: 0.9 });
    await store.saveReadingPosition({ docId, page: 10, offset: 0.1 });

    const result = await store.getReadingPosition(docId);
    expect(result).toBeDefined();
    expect(result!.page).toBe(10);
    expect(result!.offset).toBe(0.1);

    // Two saves = two outbox entries
    const outbox = await repo.unacked();
    expect(outbox).toHaveLength(2);
  });

  it('unknown docId → getReadingPosition returns undefined', async () => {
    const { store } = makeDeps();
    const result = await store.getReadingPosition('nonexistent-doc');
    expect(result).toBeUndefined();
  });
});
