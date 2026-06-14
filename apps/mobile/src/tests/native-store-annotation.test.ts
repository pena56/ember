/**
 * native-store-annotation.test.ts — thin seam test for createAnnotation
 * and listAnnotations on the NativeStore wrapper (10d).
 *
 * Mirrors native-store-session.test.ts / web's web-store-annotation.test.ts:
 * MemoryRepository + MemoryBlobStore + fake Hasher + injected clock.
 * We assert the seam (one record + one HLC-stamped outbox entry per create,
 * shared stamp, listAnnotations filtered + sorted), NOT the core internals.
 */

import { describe, expect, it } from 'vitest';

import type { Hasher, TextAnchor } from '@ember/core';
import { ANNOTATIONS_COLLECTION, MemoryBlobStore, MemoryRepository } from '@ember/store';

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

const ANCHOR: TextAnchor = {
  kind: 'text',
  page: 1,
  startChar: 0,
  endChar: 5,
  quote: 'Hello',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NativeStore annotation surface', () => {
  it('createAnnotation returns a valid Annotation with correct kind/color/anchor', async () => {
    const { store } = makeDeps();

    const annotation = await store.createAnnotation({
      docId: 'doc-1',
      kind: 'highlight',
      anchor: ANCHOR,
      color: 'yellow',
    });

    expect(annotation.id).toBeTruthy();
    expect(annotation.docId).toBe('doc-1');
    expect(annotation.kind).toBe('highlight');
    expect(annotation.color).toBe('yellow');
    expect(annotation.anchor).toEqual(ANCHOR);
    expect(typeof annotation.createdAt).toBe('number');
    expect(typeof annotation.updatedAt).toBe('string');
    expect(annotation.updatedAt.length).toBeGreaterThan(0);
  });

  it('createAnnotation writes exactly one record + one put outbox entry (invariant #2)', async () => {
    const { store, repo } = makeDeps();

    const annotation = await store.createAnnotation({
      docId: 'doc-1',
      kind: 'highlight',
      anchor: ANCHOR,
      color: 'green',
    });

    // Exactly one record in the annotations collection.
    const records = await repo.query(ANNOTATIONS_COLLECTION);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: annotation.id, docId: 'doc-1', kind: 'highlight' });

    // Exactly one outbox entry — invariant #2.
    const outbox = await repo.unacked();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      collection: ANNOTATIONS_COLLECTION,
      recordId: annotation.id,
      op: 'put',
    });
    expect(typeof outbox[0]!.hlc).toBe('string');
    expect(outbox[0]!.hlc.length).toBeGreaterThan(0);
  });

  it('createAnnotation record and outbox entry share the same HLC stamp (invariant #2)', async () => {
    const { store, repo } = makeDeps();

    const annotation = await store.createAnnotation({
      docId: 'doc-1',
      kind: 'highlight',
      anchor: ANCHOR,
      color: 'blue',
    });

    const outbox = await repo.unacked();
    expect(outbox).toHaveLength(1);

    // The outbox hlc must equal the record's updatedAt (same stamp — ONE nextStamp() call)
    expect(outbox[0]!.hlc).toBe(annotation.updatedAt);
  });

  it('listAnnotations filters by docId', async () => {
    const { store } = makeDeps();

    await store.createAnnotation({ docId: 'doc-a', kind: 'highlight', anchor: ANCHOR, color: 'yellow' });
    await store.createAnnotation({ docId: 'doc-b', kind: 'highlight', anchor: ANCHOR, color: 'blue' });
    await store.createAnnotation({ docId: 'doc-a', kind: 'highlight', anchor: ANCHOR, color: 'pink' });

    const docAAnnotations = await store.listAnnotations('doc-a');
    expect(docAAnnotations).toHaveLength(2);
    expect(docAAnnotations.every((a) => a.docId === 'doc-a')).toBe(true);

    const docBAnnotations = await store.listAnnotations('doc-b');
    expect(docBAnnotations).toHaveLength(1);
    expect(docBAnnotations[0]!.color).toBe('blue');
  });

  it('listAnnotations returns [] for an unknown docId', async () => {
    const { store } = makeDeps();
    await store.createAnnotation({ docId: 'doc-a', kind: 'highlight', anchor: ANCHOR, color: 'yellow' });
    const result = await store.listAnnotations('no-such-doc');
    expect(result).toEqual([]);
  });

  it('listAnnotations returns records sorted by createdAt ascending', async () => {
    const { store } = makeDeps();

    const a1 = await store.createAnnotation({ docId: 'doc-a', kind: 'highlight', anchor: ANCHOR, color: 'yellow' });
    const a2 = await store.createAnnotation({ docId: 'doc-a', kind: 'highlight', anchor: ANCHOR, color: 'green' });
    const a3 = await store.createAnnotation({ docId: 'doc-a', kind: 'highlight', anchor: ANCHOR, color: 'blue' });

    const listed = await store.listAnnotations('doc-a');
    expect(listed).toHaveLength(3);
    // Ascending by createdAt
    expect(listed[0]!.id).toBe(a1.id);
    expect(listed[1]!.id).toBe(a2.id);
    expect(listed[2]!.id).toBe(a3.id);
    expect(listed[0]!.createdAt).toBeLessThanOrEqual(listed[1]!.createdAt);
    expect(listed[1]!.createdAt).toBeLessThanOrEqual(listed[2]!.createdAt);
  });

  it('record round-trips: listAnnotations returns the created annotation intact', async () => {
    const { store } = makeDeps();

    const created = await store.createAnnotation({
      docId: 'doc-round',
      kind: 'highlight',
      anchor: ANCHOR,
      color: 'pink',
    });

    const listed = await store.listAnnotations('doc-round');
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: created.id,
      docId: 'doc-round',
      kind: 'highlight',
      color: 'pink',
      anchor: ANCHOR,
    });
  });
});
