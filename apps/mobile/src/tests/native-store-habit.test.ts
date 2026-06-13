/**
 * native-store-habit.test.ts — thin seam test for the read-only habit delegations
 * (listSessions + getGoalConfig) on the NativeStore wrapper (08c).
 *
 * Mirrors native-store-session.test.ts harness: MemoryRepository + MemoryBlobStore
 * + fake Hasher + injected clock. We assert the seam (delegation returns what the
 * engine returns), NOT the 08a internals already tested in packages/store.
 */

import { describe, expect, it } from 'vitest';

import type { FlushedSession, Hasher } from '@ember/core';
import { DEFAULT_GOAL_ACTIVE_MS } from '@ember/core';
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

describe('getGoalConfig', () => {
  it('returns the unpersisted 20-min default when nothing is stored', async () => {
    const { store } = makeDeps();

    const goal = await store.getGoalConfig();

    expect(goal.targetActiveMs).toBe(DEFAULT_GOAL_ACTIVE_MS);
    expect(goal.updatedAt).toBe('');
  });
});

describe('listSessions', () => {
  it('returns [] on an empty repo', async () => {
    const { store } = makeDeps();

    const sessions = await store.listSessions();

    expect(sessions).toEqual([]);
  });

  it('returns the recorded sessions after seeding via recordSession', async () => {
    const { store } = makeDeps();

    const s1 = await store.recordSession(makeFlushed({ activeMs: 15_000 }));
    const s2 = await store.recordSession(makeFlushed({ activeMs: 30_000 }));

    const sessions = await store.listSessions();

    expect(sessions).toHaveLength(2);
    const ids = sessions.map((s) => s.id);
    expect(ids).toContain(s1.id);
    expect(ids).toContain(s2.id);
  });
});
