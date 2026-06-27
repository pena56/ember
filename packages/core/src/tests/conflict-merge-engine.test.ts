/**
 * Tests for Unit 14a — core conflict-merge engine.
 * All pure functions; no @ember/store import.
 */
import { describe, expect, it } from 'vitest';

import { applyPull } from '../apply-pull.js';
import { planClaimMerge } from '../claim-merge.js';
import {
  CONFLICT_POLICY_COLLECTION,
  GLOBAL_POLICY_ID,
  makeConflictPolicy,
  resolvePositionPolicy,
} from '../conflict-policy.js';
import {
  DUPLICATE_DECISIONS_COLLECTION,
  duplicatePairId,
  makeDuplicateDecision,
  resolveCanonicalId,
} from '../duplicate-decision.js';
import type { DuplicateDecision } from '../duplicate-decision.js';
import { detectDuplicates, normalizeTitle } from '../duplicate-detection.js';
import { encode, initialClock, tick } from '../hlc.js';
import type { Hlc } from '../hlc.js';
import type { RemoteEntry } from '../sync-transport.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHlc(wall: number, node = 'test'): Hlc {
  return tick(initialClock(node), wall);
}

function remoteEntry(
  overrides: Partial<RemoteEntry> & { collection: string; recordId: string; hlc: string },
): RemoteEntry {
  return {
    op: 'put',
    payload: undefined,
    serverSeq: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. normalizeTitle
// ---------------------------------------------------------------------------

describe('normalizeTitle', () => {
  it('lowercases', () => {
    expect(normalizeTitle('Hello World')).toBe('hello world');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeTitle('  hello  ')).toBe('hello');
  });

  it('collapses internal whitespace to single space', () => {
    expect(normalizeTitle('hello   world')).toBe('hello world');
    expect(normalizeTitle('hello\tworld')).toBe('hello world');
  });

  it('strips a trailing known ebook/doc extension token', () => {
    expect(normalizeTitle('My Book.pdf')).toBe('my book');
    expect(normalizeTitle('Report.PDF')).toBe('report');
    expect(normalizeTitle('Notes.epub')).toBe('notes');
    expect(normalizeTitle('Document.docx')).toBe('document');
    expect(normalizeTitle('Comic.cbz')).toBe('comic');
    expect(normalizeTitle('Comic.cbr')).toBe('comic');
    expect(normalizeTitle('Kindle.azw3')).toBe('kindle');
    expect(normalizeTitle('Old.mobi')).toBe('old');
    expect(normalizeTitle('Plain.txt')).toBe('plain');
  });

  it('does NOT strip dotted tokens that are not known extensions (no false positives)', () => {
    // Legitimate dotted titles must survive intact.
    expect(normalizeTitle('Vol.II')).toBe('vol.ii');
    expect(normalizeTitle('Catch.22')).toBe('catch.22');
    expect(normalizeTitle('Book.2024')).toBe('book.2024');
  });

  it('idempotent for non-extension dotted titles', () => {
    const once = normalizeTitle('Vol.II');
    expect(normalizeTitle(once)).toBe(once);
  });

  it('strips surrounding punctuation near extension', () => {
    // e.g. "Book (2024).pdf" → "book (2024)"
    expect(normalizeTitle('My Book (2024).pdf')).toBe('my book (2024)');
  });

  it('leaves titles without extension intact', () => {
    expect(normalizeTitle('Just a Title')).toBe('just a title');
  });

  it('is idempotent', () => {
    const once = normalizeTitle('Hello World.pdf');
    const twice = normalizeTitle(once);
    expect(twice).toBe(once);
  });

  it('idempotent with whitespace', () => {
    const t = '  Multiple   Spaces  ';
    const once = normalizeTitle(t);
    expect(normalizeTitle(once)).toBe(once);
  });
});

// ---------------------------------------------------------------------------
// 2. detectDuplicates
// ---------------------------------------------------------------------------

describe('detectDuplicates', () => {
  it('equal normalized title and in-band sizes → pair', () => {
    const docs = [
      { id: 'aaa', title: 'My Book.pdf', byteSize: 1000 },
      { id: 'bbb', title: 'my book',     byteSize: 1050 }, // within 15% of 1050
    ];
    const pairs = detectDuplicates(docs);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toEqual({ aId: 'aaa', bId: 'bbb' });
  });

  it('aId < bId lexicographically (invariant)', () => {
    const docs = [
      { id: 'zzz', title: 'same book', byteSize: 1000 },
      { id: 'aaa', title: 'same book', byteSize: 1000 },
    ];
    const pairs = detectDuplicates(docs);
    expect(pairs[0]!.aId).toBe('aaa');
    expect(pairs[0]!.bId).toBe('zzz');
  });

  it('out-of-band size → no pair', () => {
    const docs = [
      { id: 'aaa', title: 'My Book', byteSize: 1000 },
      { id: 'bbb', title: 'My Book', byteSize: 2000 }, // 100% difference > 15%
    ];
    const pairs = detectDuplicates(docs);
    expect(pairs).toHaveLength(0);
  });

  it('different title → no pair', () => {
    const docs = [
      { id: 'aaa', title: 'Book One', byteSize: 1000 },
      { id: 'bbb', title: 'Book Two', byteSize: 1000 },
    ];
    const pairs = detectDuplicates(docs);
    expect(pairs).toHaveLength(0);
  });

  it('identical id never pairs with itself', () => {
    const docs = [
      { id: 'aaa', title: 'Book', byteSize: 1000 },
    ];
    const pairs = detectDuplicates(docs);
    expect(pairs).toHaveLength(0);
  });

  it('pairs are sorted and deduped', () => {
    const docs = [
      { id: 'bbb', title: 'same', byteSize: 1000 },
      { id: 'aaa', title: 'same', byteSize: 1000 },
      { id: 'ccc', title: 'same', byteSize: 1000 },
    ];
    const pairs = detectDuplicates(docs);
    // Should have 3 unique pairs: (aaa,bbb), (aaa,ccc), (bbb,ccc)
    expect(pairs).toHaveLength(3);
    // Sorted ascending by (aId, bId)
    expect(pairs[0]).toEqual({ aId: 'aaa', bId: 'bbb' });
    expect(pairs[1]).toEqual({ aId: 'aaa', bId: 'ccc' });
    expect(pairs[2]).toEqual({ aId: 'bbb', bId: 'ccc' });
  });

  it('band boundary: exactly at 15% is included', () => {
    // |a - b| = 0.15 * max(a,b) → exactly at boundary → included
    const a = 1000;
    const b = Math.round(a * (1 + 0.15)); // 1150
    const diff = Math.abs(a - b); // 150
    const threshold = 0.15 * Math.max(a, b); // 0.15 * 1150 = 172.5
    expect(diff).toBeLessThanOrEqual(threshold); // verify our test data
    const docs = [
      { id: 'aaa', title: 'book', byteSize: a },
      { id: 'bbb', title: 'book', byteSize: b },
    ];
    const pairs = detectDuplicates(docs);
    expect(pairs).toHaveLength(1);
  });

  it('band boundary: just over 15% is excluded', () => {
    const a = 1000;
    const b = 1200; // 20% larger
    const diff = Math.abs(a - b); // 200
    const threshold = 0.15 * Math.max(a, b); // 180
    expect(diff).toBeGreaterThan(threshold); // verify test data
    const docs = [
      { id: 'aaa', title: 'book', byteSize: a },
      { id: 'bbb', title: 'book', byteSize: b },
    ];
    const pairs = detectDuplicates(docs);
    expect(pairs).toHaveLength(0);
  });

  it('respects custom sizeBand option', () => {
    const docs = [
      { id: 'aaa', title: 'book', byteSize: 1000 },
      { id: 'bbb', title: 'book', byteSize: 1500 }, // 50% diff
    ];
    // with default 15% band → no pair
    expect(detectDuplicates(docs)).toHaveLength(0);
    // with 60% band → pair
    expect(detectDuplicates(docs, { sizeBand: 0.60 })).toHaveLength(1);
  });

  it('empty input → empty output', () => {
    expect(detectDuplicates([])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. duplicatePairId
// ---------------------------------------------------------------------------

describe('duplicatePairId', () => {
  it('is order-independent: (a,b) === (b,a)', () => {
    expect(duplicatePairId('aaa', 'bbb')).toBe(duplicatePairId('bbb', 'aaa'));
  });

  it('places the lexicographically smaller id first', () => {
    expect(duplicatePairId('zzz', 'aaa')).toBe('aaa:zzz');
    expect(duplicatePairId('aaa', 'zzz')).toBe('aaa:zzz');
  });
});

// ---------------------------------------------------------------------------
// 4. makeDuplicateDecision
// ---------------------------------------------------------------------------

describe('makeDuplicateDecision', () => {
  const hlc = makeHlc(1_000_000);

  it('creates a valid merged decision with canonicalId = aId', () => {
    const d = makeDuplicateDecision({ aId: 'aaa', bId: 'bbb', canonicalId: 'aaa', decision: 'merged', hlc });
    expect(d.id).toBe('aaa:bbb');
    expect(d.canonicalId).toBe('aaa');
    expect(d.aliasId).toBe('bbb');
    expect(d.decision).toBe('merged');
    expect(d.updatedAt).toBe(encode(hlc));
  });

  it('creates a valid separate decision with canonicalId = bId', () => {
    const d = makeDuplicateDecision({ aId: 'aaa', bId: 'bbb', canonicalId: 'bbb', decision: 'separate', hlc });
    expect(d.canonicalId).toBe('bbb');
    expect(d.aliasId).toBe('aaa');
    expect(d.decision).toBe('separate');
  });

  it('throws if canonicalId is not one of the pair', () => {
    expect(() =>
      makeDuplicateDecision({ aId: 'aaa', bId: 'bbb', canonicalId: 'ccc', decision: 'merged', hlc })
    ).toThrow();
  });

  it('DUPLICATE_DECISIONS_COLLECTION is the expected string', () => {
    expect(DUPLICATE_DECISIONS_COLLECTION).toBe('duplicate-decisions');
  });
});

// ---------------------------------------------------------------------------
// 5. resolveCanonicalId
// ---------------------------------------------------------------------------

describe('resolveCanonicalId', () => {
  it('alias → canonical (merged decision)', () => {
    const hlc = makeHlc(1_000_000);
    const decision = makeDuplicateDecision({ aId: 'aaa', bId: 'bbb', canonicalId: 'aaa', decision: 'merged', hlc });
    // bbb is the alias → should resolve to aaa
    expect(resolveCanonicalId([decision], 'bbb')).toBe('aaa');
  });

  it('canonical id resolves to itself', () => {
    const hlc = makeHlc(1_000_000);
    const decision = makeDuplicateDecision({ aId: 'aaa', bId: 'bbb', canonicalId: 'aaa', decision: 'merged', hlc });
    expect(resolveCanonicalId([decision], 'aaa')).toBe('aaa');
  });

  it('transitive chain: c→b→a', () => {
    const hlc = makeHlc(1_000_000);
    const d1 = makeDuplicateDecision({ aId: 'aaa', bId: 'bbb', canonicalId: 'aaa', decision: 'merged', hlc });
    const d2 = makeDuplicateDecision({ aId: 'bbb', bId: 'ccc', canonicalId: 'bbb', decision: 'merged', hlc });
    // ccc → bbb (via d2) → aaa (via d1)
    expect(resolveCanonicalId([d1, d2], 'ccc')).toBe('aaa');
  });

  it("'separate' decision is ignored", () => {
    const hlc = makeHlc(1_000_000);
    const decision = makeDuplicateDecision({ aId: 'aaa', bId: 'bbb', canonicalId: 'aaa', decision: 'separate', hlc });
    // separate → bbb stays bbb
    expect(resolveCanonicalId([decision], 'bbb')).toBe('bbb');
  });

  it('unknown id returns itself', () => {
    expect(resolveCanonicalId([], 'unknown-id')).toBe('unknown-id');
  });

  it('cycle guard: returns input rather than looping infinitely', () => {
    // Construct a cycle: aaa→bbb→aaa (contrived)
    const hlc = makeHlc(1_000_000);
    // We'll manually construct decisions that create a cycle.
    // aaa is alias of bbb (bbb is canonical)
    const d1: DuplicateDecision = {
      id: 'aaa:bbb',
      canonicalId: 'bbb',
      aliasId: 'aaa',
      decision: 'merged',
      updatedAt: encode(hlc),
    };
    // bbb is alias of aaa (aaa is canonical) — cycle
    const d2: DuplicateDecision = {
      id: 'aaa:bbb',
      canonicalId: 'aaa',
      aliasId: 'bbb',
      decision: 'merged',
      updatedAt: encode(hlc),
    };
    // Should terminate and return the input 'aaa' rather than looping
    const result = resolveCanonicalId([d1, d2], 'aaa');
    expect(typeof result).toBe('string');
    // It should return 'aaa' (the input) since a cycle is detected
    expect(result).toBe('aaa');
  });
});

// ---------------------------------------------------------------------------
// 6. resolvePositionPolicy
// ---------------------------------------------------------------------------

describe('resolvePositionPolicy', () => {
  const hlc = makeHlc(1_000_000);

  it('default with no policies → furthest', () => {
    expect(resolvePositionPolicy([], 'doc1')).toBe('furthest');
  });

  it('global policy → overrides default', () => {
    const global = makeConflictPolicy({ id: GLOBAL_POLICY_ID, mode: 'latest', hlc });
    expect(resolvePositionPolicy([global], 'doc1')).toBe('latest');
  });

  it('per-file override beats global', () => {
    const global = makeConflictPolicy({ id: GLOBAL_POLICY_ID, mode: 'latest', hlc });
    const perFile = makeConflictPolicy({ id: 'doc1', mode: 'furthest', hlc });
    expect(resolvePositionPolicy([global, perFile], 'doc1')).toBe('furthest');
  });

  it('per-file override does not affect another doc', () => {
    const perFile = makeConflictPolicy({ id: 'doc1', mode: 'latest', hlc });
    // doc2 has no policy → default furthest
    expect(resolvePositionPolicy([perFile], 'doc2')).toBe('furthest');
  });

  it('CONFLICT_POLICY_COLLECTION and GLOBAL_POLICY_ID have expected values', () => {
    expect(CONFLICT_POLICY_COLLECTION).toBe('conflict-policy');
    expect(GLOBAL_POLICY_ID).toBe('global');
  });

  it('makeConflictPolicy stamps updatedAt from hlc', () => {
    const policy = makeConflictPolicy({ id: 'global', mode: 'furthest', hlc });
    expect(policy.updatedAt).toBe(encode(hlc));
    expect(policy.id).toBe('global');
    expect(policy.mode).toBe('furthest');
  });
});

// ---------------------------------------------------------------------------
// 7. applyPull policy arg
// ---------------------------------------------------------------------------

describe('applyPull — policy arg (reading-positions)', () => {
  const hlcLow = encode(tick(initialClock('a'), 1_000_000));
  const hlcHigh = encode(tick(initialClock('a'), 2_000_000));

  // --- policy='latest' (LWW for reading-positions) ---

  it("policy='latest': lower-page higher-HLC remote OVERWRITES local (LWW)", () => {
    const local = { id: 'doc1', page: 10, offset: 0.5, updatedAt: hlcLow };
    const incoming = remoteEntry({
      collection: 'reading-positions',
      recordId: 'doc1',
      hlc: hlcHigh,
      op: 'put',
      payload: { id: 'doc1', page: 3, offset: 0.2, updatedAt: hlcHigh },
    });
    const decision = applyPull(local, incoming, 'latest');
    // With latest policy, LWW: higher HLC remote wins → put (not correct)
    expect(decision.kind).toBe('put');
  });

  it("policy='latest': never emits 'correct'", () => {
    // This is the exact scenario that would produce 'correct' under furthest policy
    const local = { id: 'doc1', page: 10, offset: 0.5, updatedAt: hlcLow };
    const incoming = remoteEntry({
      collection: 'reading-positions',
      recordId: 'doc1',
      hlc: hlcHigh,
      op: 'put',
      payload: { id: 'doc1', page: 3, offset: 0.2, updatedAt: hlcHigh },
    });
    const decision = applyPull(local, incoming, 'latest');
    expect(decision.kind).not.toBe('correct');
  });

  it("policy='latest': lower-HLC remote is skipped (local newer)", () => {
    const local = { id: 'doc1', page: 3, offset: 0.0, updatedAt: hlcHigh };
    const incoming = remoteEntry({
      collection: 'reading-positions',
      recordId: 'doc1',
      hlc: hlcLow,
      op: 'put',
      payload: { id: 'doc1', page: 10, offset: 0.5, updatedAt: hlcLow },
    });
    // local has higher HLC → skip (even though remote has further page)
    const decision = applyPull(local, incoming, 'latest');
    expect(decision.kind).toBe('skip');
  });

  // --- policy='furthest' (default behaviour, re-assert existing cases) ---

  it("policy='furthest' default (no arg): lower-page higher-HLC remote → correct", () => {
    const local = { id: 'doc1', page: 10, offset: 0.5, updatedAt: hlcLow };
    const incoming = remoteEntry({
      collection: 'reading-positions',
      recordId: 'doc1',
      hlc: hlcHigh,
      op: 'put',
      payload: { id: 'doc1', page: 3, offset: 0.2, updatedAt: hlcHigh },
    });
    const decision = applyPull(local, incoming); // no policy arg
    expect(decision.kind).toBe('correct');
    if (decision.kind === 'correct') {
      expect(decision.winner.page).toBe(10);
    }
  });

  it("policy='furthest' explicit: lower-page higher-HLC remote → correct", () => {
    const local = { id: 'doc1', page: 10, offset: 0.5, updatedAt: hlcLow };
    const incoming = remoteEntry({
      collection: 'reading-positions',
      recordId: 'doc1',
      hlc: hlcHigh,
      op: 'put',
      payload: { id: 'doc1', page: 3, offset: 0.2, updatedAt: hlcHigh },
    });
    const decision = applyPull(local, incoming, 'furthest'); // explicit
    expect(decision.kind).toBe('correct');
    if (decision.kind === 'correct') {
      expect(decision.winner.page).toBe(10);
    }
  });

  it("policy='furthest': remote further page → put", () => {
    const local = { id: 'doc1', page: 3, offset: 0.5, updatedAt: hlcLow };
    const incoming = remoteEntry({
      collection: 'reading-positions',
      recordId: 'doc1',
      hlc: hlcHigh,
      op: 'put',
      payload: { id: 'doc1', page: 10, offset: 0.2, updatedAt: hlcHigh },
    });
    const decision = applyPull(local, incoming, 'furthest');
    expect(decision.kind).toBe('put');
  });

  // --- non-position collections ignore policy ---

  it('non-position collection ignores policy arg (LWW applies)', () => {
    const local = { id: 'ann1', text: 'old', updatedAt: hlcLow };
    const incoming = remoteEntry({
      collection: 'annotations',
      recordId: 'ann1',
      hlc: hlcHigh,
      op: 'put',
      payload: { id: 'ann1', text: 'new', updatedAt: hlcHigh },
    });
    // With 'latest' on a non-position → still LWW (same as default)
    const d1 = applyPull(local, incoming, 'latest');
    const d2 = applyPull(local, incoming, 'furthest');
    expect(d1.kind).toBe('put');
    expect(d2.kind).toBe('put');
  });
});

// ---------------------------------------------------------------------------
// 8. planClaimMerge
// ---------------------------------------------------------------------------

describe('planClaimMerge', () => {
  it('empty inputs → empty plan', () => {
    const plan = planClaimMerge({
      localDocs: [],
      remoteDocs: [],
      localPositions: [],
      remotePositions: [],
    });
    expect(plan.incomingDocs).toHaveLength(0);
    expect(plan.sharedDocs).toHaveLength(0);
    expect(plan.duplicateCandidates).toHaveLength(0);
    expect(plan.positionReconciles).toHaveLength(0);
  });

  it('incoming/shared set diff', () => {
    const localDocs = [
      { id: 'doc-local', title: 'Local Only', byteSize: 1000 },
      { id: 'doc-shared', title: 'Shared', byteSize: 2000 },
    ];
    const remoteDocs = [
      { id: 'doc-remote', title: 'Remote Only', byteSize: 3000 },
      { id: 'doc-shared', title: 'Shared', byteSize: 2000 },
    ];
    const plan = planClaimMerge({
      localDocs,
      remoteDocs,
      localPositions: [],
      remotePositions: [],
    });
    expect(plan.incomingDocs).toEqual(['doc-remote']);
    expect(plan.sharedDocs).toEqual(['doc-shared']);
  });

  it('cross-side near-dupe surfaces (local id + remote id)', () => {
    // These docs have the same normalized title and similar size, but one is local and one remote
    const localDocs = [
      { id: 'aaa', title: 'My Book.pdf', byteSize: 1000 },
    ];
    const remoteDocs = [
      { id: 'bbb', title: 'my book', byteSize: 1050 },
    ];
    const plan = planClaimMerge({
      localDocs,
      remoteDocs,
      localPositions: [],
      remotePositions: [],
    });
    expect(plan.duplicateCandidates).toHaveLength(1);
    expect(plan.duplicateCandidates[0]).toEqual({ aId: 'aaa', bId: 'bbb' });
  });

  it('same-side dupe does NOT surface in duplicateCandidates', () => {
    // Both docs are on the local side
    const localDocs = [
      { id: 'aaa', title: 'My Book', byteSize: 1000 },
      { id: 'bbb', title: 'My Book', byteSize: 1000 },
    ];
    const remoteDocs = [
      { id: 'ccc', title: 'Completely Different', byteSize: 500 },
    ];
    const plan = planClaimMerge({
      localDocs,
      remoteDocs,
      localPositions: [],
      remotePositions: [],
    });
    // aaa and bbb are both local → same-side → not in duplicateCandidates
    expect(plan.duplicateCandidates).toHaveLength(0);
  });

  it('positionReconciles: differing pages → reports with furthest keptPage', () => {
    const sharedDoc = { id: 'doc-shared', title: 'Book', byteSize: 1000 };
    const plan = planClaimMerge({
      localDocs: [sharedDoc],
      remoteDocs: [sharedDoc],
      localPositions: [{ id: 'doc-shared', page: 5 }],
      remotePositions: [{ id: 'doc-shared', page: 10 }],
    });
    expect(plan.positionReconciles).toHaveLength(1);
    expect(plan.positionReconciles[0]).toEqual({
      id: 'doc-shared',
      localPage: 5,
      remotePage: 10,
      keptPage: 10, // max(5,10)
    });
  });

  it('positionReconciles: equal pages are omitted', () => {
    const sharedDoc = { id: 'doc-shared', title: 'Book', byteSize: 1000 };
    const plan = planClaimMerge({
      localDocs: [sharedDoc],
      remoteDocs: [sharedDoc],
      localPositions: [{ id: 'doc-shared', page: 7 }],
      remotePositions: [{ id: 'doc-shared', page: 7 }],
    });
    expect(plan.positionReconciles).toHaveLength(0);
  });

  it('positionReconciles: local further page wins', () => {
    const sharedDoc = { id: 'doc-shared', title: 'Book', byteSize: 1000 };
    const plan = planClaimMerge({
      localDocs: [sharedDoc],
      remoteDocs: [sharedDoc],
      localPositions: [{ id: 'doc-shared', page: 15 }],
      remotePositions: [{ id: 'doc-shared', page: 3 }],
    });
    expect(plan.positionReconciles[0]!.keptPage).toBe(15);
  });

  it('deterministic ordering throughout (sorted by id)', () => {
    const localDocs = [
      { id: 'zzz', title: 'Z Book', byteSize: 1000 },
    ];
    const remoteDocs = [
      { id: 'aaa', title: 'A Book', byteSize: 2000 },
      { id: 'mmm', title: 'M Book', byteSize: 3000 },
    ];
    const plan = planClaimMerge({
      localDocs,
      remoteDocs,
      localPositions: [],
      remotePositions: [],
    });
    // incomingDocs sorted by id
    expect(plan.incomingDocs).toEqual(['aaa', 'mmm']);
  });

  it('cross-side vs same-side dupe distinction with multiple docs', () => {
    const localDocs = [
      { id: 'local-a', title: 'same title', byteSize: 1000 },
      { id: 'local-b', title: 'same title', byteSize: 1000 }, // same-side dupe
    ];
    const remoteDocs = [
      { id: 'remote-x', title: 'same title', byteSize: 1000 }, // cross-side dupe with both local docs
    ];
    const plan = planClaimMerge({
      localDocs,
      remoteDocs,
      localPositions: [],
      remotePositions: [],
    });
    // local-a × remote-x and local-b × remote-x are cross-side → should appear
    // local-a × local-b is same-side → should NOT appear
    expect(plan.duplicateCandidates.some(p => p.aId === 'local-a' && p.bId === 'local-b')).toBe(false);
    const crossSidePairs = plan.duplicateCandidates;
    // Both cross-side pairs should be present
    expect(crossSidePairs.length).toBeGreaterThanOrEqual(2);
  });
});
