/**
 * native-store-session.test.ts — thin seam test for recordSession on the NativeStore wrapper.
 *
 * Mirrors native-store-reading-position.test.ts structure: MemoryRepository +
 * MemoryBlobStore + fake Hasher + injected clock. We assert the seam (one record
 * + one outbox entry, append-only, HLC monotonic), NOT the 07a internals that are
 * already tested in packages/store.
 */

import { describe, expect, it } from 'vitest';

import type { FlushedSession, Hasher } from '@ember/core';
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

/** A minimal FlushedSession fixture. */
function makeFlushed(overrides?: Partial<FlushedSession>): FlushedSession {
  return {
    docId: 'doc-abc',
    localDay: '2026-06-12',
    tzOffsetMinutes: 60,
    startedAt: 1_749_686_400_000,
    endedAt: 1_749_686_445_000,
    activeMs: 45_000,
    pages: [1, 2, 3],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('recordSession', () => {
  it('writes exactly one sessions record (uuid id, not docId) + one outbox entry', async () => {
    const { store, repo } = makeDeps();
    const flushed = makeFlushed();

    const session = await store.recordSession(flushed);

    // id is a fresh uuid — NOT the docId
    expect(session.id).not.toBe(flushed.docId);
    expect(typeof session.id).toBe('string');
    expect(session.id.length).toBeGreaterThan(0);

    // Session fields match the flushed input
    expect(session.docId).toBe(flushed.docId);
    expect(session.localDay).toBe(flushed.localDay);
    expect(session.tzOffsetMinutes).toBe(flushed.tzOffsetMinutes);
    expect(session.startedAt).toBe(flushed.startedAt);
    expect(session.endedAt).toBe(flushed.endedAt);
    expect(session.activeMs).toBe(flushed.activeMs);
    expect(session.pages).toEqual(flushed.pages);
    expect(typeof session.updatedAt).toBe('string');
    expect(session.updatedAt.length).toBeGreaterThan(0);

    // Exactly one outbox entry — invariant #2
    const outbox = await repo.unacked();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.recordId).toBe(session.id);
    expect(outbox[0]!.op).toBe('put');
    expect(typeof outbox[0]!.hlc).toBe('string');
    expect(outbox[0]!.hlc.length).toBeGreaterThan(0);

    // Outbox payload deep-equals the returned session
    expect(outbox[0]!.payload).toEqual(session);
  });

  it('two calls append two distinct records — no overwrite (append-only, invariant #3)', async () => {
    const { store, repo } = makeDeps();

    const session1 = await store.recordSession(makeFlushed({ activeMs: 15_000 }));
    const session2 = await store.recordSession(makeFlushed({ activeMs: 30_000 }));

    // Two distinct ids
    expect(session1.id).not.toBe(session2.id);

    // Two outbox entries
    const outbox = await repo.unacked();
    expect(outbox).toHaveLength(2);

    // HLC strings are monotonic — updatedAt of session2 > session1
    expect(session2.updatedAt > session1.updatedAt).toBe(true);
  });

  it('returned session deep-equals the outbox payload', async () => {
    const { store, repo } = makeDeps();

    const session = await store.recordSession(makeFlushed());
    const outbox = await repo.unacked();

    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.payload).toEqual(session);
  });
});
