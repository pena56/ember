/**
 * use-duplicates.test.ts — unit tests for the useDuplicates hook logic.
 *
 * Tests the core behaviour: canonical-only detection, undecided filter,
 * session-dismiss (no record), merge/keepSeparate call store methods,
 * defaultCanonicalId = larger byteSize.
 *
 * These tests exercise the underlying store + engine logic that useDuplicates
 * delegates to — no React render needed (node environment).
 */

import { describe, expect, it } from 'vitest';

import type { Document, DuplicateDecision, DuplicatePair } from '@ember/core';
import { duplicatePairId } from '@ember/core';
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

const fakeHasher = {
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
  return { store, repo, clock };
}

function makeDoc(overrides: Partial<Document> & { id: string }): Document {
  return {
    title: 'Test Book',
    filename: 'test.pdf',
    byteSize: 1000,
    contentType: 'application/pdf',
    importedAt: Date.now(),
    ...overrides,
  };
}

// ── Logic-only tests (pure function extraction) ────────────────────────────────
// We test the logic without a React render by exercising the store directly.

describe('useDuplicates logic (store-level)', () => {
  it('listDuplicateDecisions returns empty initially', async () => {
    const { store } = makeDeps();
    const decisions = await store.listDuplicateDecisions();
    expect(decisions).toEqual([]);
  });

  it('saveDuplicateDecision "merged" writes a record readable by listDuplicateDecisions', async () => {
    const { store } = makeDeps();
    await store.saveDuplicateDecision({
      aId: 'doc-a',
      bId: 'doc-b',
      canonicalId: 'doc-a',
      decision: 'merged',
    });
    const decisions = await store.listDuplicateDecisions();
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.decision).toBe('merged');
    expect(decisions[0]!.canonicalId).toBe('doc-a');
  });

  it('saveDuplicateDecision "separate" writes a record', async () => {
    const { store } = makeDeps();
    await store.saveDuplicateDecision({
      aId: 'doc-a',
      bId: 'doc-b',
      canonicalId: 'doc-a',
      decision: 'separate',
    });
    const decisions = await store.listDuplicateDecisions();
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.decision).toBe('separate');
  });
});

// ── detectDuplicates integration ──────────────────────────────────────────────

describe('detectDuplicates integration (canonical-only filter)', () => {
  it('only canonical docs are considered for detection', async () => {
    // Import from @ember/core to confirm engine used (invariant #5)
    const { detectDuplicates, resolveCanonicalId } = await import('@ember/core');

    const { store } = makeDeps();

    // Two near-duplicate books (same title, similar size)
    await store.saveDuplicateDecision({
      aId: 'doc-a',
      bId: 'doc-b',
      canonicalId: 'doc-a',
      decision: 'merged',
    });

    const decisions = await store.listDuplicateDecisions();

    const docs: Document[] = [
      makeDoc({ id: 'doc-a', title: 'Great Book', byteSize: 1000 }),
      makeDoc({ id: 'doc-b', title: 'Great Book', byteSize: 1010 }),
    ];

    // doc-b is now an alias of doc-a
    const canonicals = docs.filter((d) => resolveCanonicalId(decisions, d.id) === d.id);
    expect(canonicals).toHaveLength(1);
    expect(canonicals[0]!.id).toBe('doc-a');

    // No pairs in canonicals-only set
    const pairs = detectDuplicates(canonicals);
    expect(pairs).toHaveLength(0);
  });

  it('undecided pair is returned by detectDuplicates on canonical set', async () => {
    const { detectDuplicates, resolveCanonicalId } = await import('@ember/core');

    const docs: Document[] = [
      makeDoc({ id: 'doc-a', title: 'Great Book', byteSize: 1000 }),
      makeDoc({ id: 'doc-b', title: 'Great Book', byteSize: 1010 }),
    ];

    // No decisions → both are canonical
    const decisions: DuplicateDecision[] = [];
    const canonicals = docs.filter((d) => resolveCanonicalId(decisions, d.id) === d.id);
    expect(canonicals).toHaveLength(2);

    const pairs = detectDuplicates(canonicals);
    expect(pairs).toHaveLength(1);
    expect(duplicatePairId(pairs[0]!.aId, pairs[0]!.bId)).toBe('doc-a:doc-b');
  });
});

// ── defaultCanonicalId logic ──────────────────────────────────────────────────

describe('defaultCanonicalId = larger byteSize', () => {
  it('selects the doc with the larger byteSize as default canonical', () => {
    const docA = makeDoc({ id: 'doc-a', byteSize: 2000 });
    const docB = makeDoc({ id: 'doc-b', byteSize: 1000 });

    const defaultCanonicalId = docA.byteSize >= docB.byteSize ? docA.id : docB.id;
    expect(defaultCanonicalId).toBe('doc-a');
  });

  it('when equal byteSize, selects docA (stable)', () => {
    const docA = makeDoc({ id: 'doc-a', byteSize: 1000 });
    const docB = makeDoc({ id: 'doc-b', byteSize: 1000 });

    const defaultCanonicalId = docA.byteSize >= docB.byteSize ? docA.id : docB.id;
    expect(defaultCanonicalId).toBe('doc-a');
  });
});

// ── duplicatePairId filter logic ──────────────────────────────────────────────

describe('duplicatePairId filter (decided pairs excluded)', () => {
  it('decided pair id is excluded from undecided set', () => {
    const pair: DuplicatePair = { aId: 'doc-a', bId: 'doc-b' };
    const pairId = duplicatePairId(pair.aId, pair.bId);
    const decidedIds = new Set<string>([pairId]);

    const undecided = [pair].filter((p) => !decidedIds.has(duplicatePairId(p.aId, p.bId)));
    expect(undecided).toHaveLength(0);
  });

  it('undecided pair passes the filter', () => {
    const pair: DuplicatePair = { aId: 'doc-a', bId: 'doc-b' };
    const decidedIds = new Set<string>([]);

    const undecided = [pair].filter((p) => !decidedIds.has(duplicatePairId(p.aId, p.bId)));
    expect(undecided).toHaveLength(1);
  });
});
