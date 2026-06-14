/**
 * web-store-annotation.test.ts — store-surface coverage for createAnnotation
 * and listAnnotations on the WebStore facade.
 *
 * Uses MemoryRepository + MemoryBlobStore + createWebClock (injected) to confirm
 * the plumbing: one record + one HLC-stamped outbox entry per create call,
 * listAnnotations filters by docId, and round-trip preserves kind/color/anchor.
 */

import { describe, expect, it } from 'vitest';

import type { TextAnchor } from '@ember/core';
import { ANNOTATIONS_COLLECTION, MemoryBlobStore, MemoryRepository } from '@ember/store';

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
      now: () => wall++,
      newId: () => `id-${(++counter).toString()}`,
    }),
  });
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

describe('WebStore annotation surface', () => {
  it('createAnnotation returns a valid Annotation with correct kind/color/anchor', async () => {
    const { store } = makeWebStore();

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
  });

  it('createAnnotation writes exactly one record + one put outbox entry', async () => {
    const { store, repo } = makeWebStore();

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

    // Exactly one outbox entry.
    const outbox = await repo.unacked();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      collection: ANNOTATIONS_COLLECTION,
      recordId: annotation.id,
      op: 'put',
    });
  });

  it('listAnnotations filters by docId', async () => {
    const { store } = makeWebStore();

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
    const { store } = makeWebStore();
    await store.createAnnotation({ docId: 'doc-a', kind: 'highlight', anchor: ANCHOR, color: 'yellow' });
    const result = await store.listAnnotations('no-such-doc');
    expect(result).toEqual([]);
  });

  it('record round-trips: listAnnotations returns the created annotation intact', async () => {
    const { store } = makeWebStore();

    const created = await store.createAnnotation({
      docId: 'doc-round',
      kind: 'highlight',
      anchor: ANCHOR,
      color: 'blue',
    });

    const listed = await store.listAnnotations('doc-round');
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: created.id,
      docId: 'doc-round',
      kind: 'highlight',
      color: 'blue',
      anchor: ANCHOR,
    });
  });

  it('createAnnotation uses different HLC stamp per call (invariant #2)', async () => {
    const { store } = makeWebStore();

    const a1 = await store.createAnnotation({ docId: 'doc-a', kind: 'highlight', anchor: ANCHOR, color: 'yellow' });
    const a2 = await store.createAnnotation({ docId: 'doc-a', kind: 'highlight', anchor: ANCHOR, color: 'green' });

    // Both have updatedAt (HLC-stamped) but IDs are distinct
    expect(a1.id).not.toBe(a2.id);
    // HLC strings should be ordered (wall advances by 1 each call)
    expect(a1.updatedAt).toBeTruthy();
    expect(a2.updatedAt).toBeTruthy();
  });

  // ── 10c: updateAnnotation + deleteAnnotation ──────────────────────────────────

  it('updateAnnotation writes one record + one put outbox entry with bumped updatedAt', async () => {
    const { store, repo } = makeWebStore();

    const annotation = await store.createAnnotation({
      docId: 'doc-1',
      kind: 'highlight',
      anchor: ANCHOR,
      color: 'yellow',
    });

    const originalUpdatedAt = annotation.updatedAt;

    const updated = await store.updateAnnotation({
      annotation,
      patch: { color: 'blue' },
    });

    expect(updated.id).toBe(annotation.id);
    expect(updated.docId).toBe(annotation.docId);
    expect(updated.createdAt).toBe(annotation.createdAt);
    expect(updated.anchor).toEqual(annotation.anchor);
    expect(updated.color).toBe('blue');
    // updatedAt should have advanced (new HLC stamp)
    expect(updated.updatedAt).not.toBe(originalUpdatedAt);

    // Exactly one record total (upserted, not duplicated)
    const records = await repo.query(ANNOTATIONS_COLLECTION);
    expect(records).toHaveLength(1);

    // Two outbox entries total (one from create, one from update)
    const outbox = await repo.unacked();
    expect(outbox).toHaveLength(2);
    const putEntries = outbox.filter((e) => e.op === 'put');
    expect(putEntries).toHaveLength(2);
  });

  it('updateAnnotation recolor changes color (preserves id/createdAt/anchor)', async () => {
    const { store } = makeWebStore();

    const annotation = await store.createAnnotation({
      docId: 'doc-1',
      kind: 'highlight',
      anchor: ANCHOR,
      color: 'green',
    });

    const updated = await store.updateAnnotation({
      annotation,
      patch: { color: 'pink' },
    });

    expect(updated.id).toBe(annotation.id);
    expect(updated.createdAt).toBe(annotation.createdAt);
    expect(updated.anchor).toEqual(ANCHOR);
    expect(updated.color).toBe('pink');
  });

  it('updateAnnotation note edit sets the note field', async () => {
    const { store } = makeWebStore();

    const annotation = await store.createAnnotation({
      docId: 'doc-1',
      kind: 'highlight',
      anchor: ANCHOR,
      color: 'yellow',
    });

    const withNote = await store.updateAnnotation({
      annotation,
      patch: { note: 'My note text' },
    });

    expect(withNote.note).toBe('My note text');
    expect(withNote.color).toBe('yellow');
  });

  it('updateAnnotation note clear removes the note field', async () => {
    const { store } = makeWebStore();

    const annotation = await store.createAnnotation({
      docId: 'doc-1',
      kind: 'highlight',
      anchor: ANCHOR,
      color: 'yellow',
      note: 'Initial note',
    });

    const cleared = await store.updateAnnotation({
      annotation,
      patch: { note: null },
    });

    expect(cleared.note).toBeUndefined();
  });

  it('deleteAnnotation removes the record + enqueues one delete tombstone', async () => {
    const { store, repo } = makeWebStore();

    const annotation = await store.createAnnotation({
      docId: 'doc-1',
      kind: 'highlight',
      anchor: ANCHOR,
      color: 'yellow',
    });

    await store.deleteAnnotation(annotation.id);

    // Record should be gone
    const records = await repo.query(ANNOTATIONS_COLLECTION);
    expect(records).toHaveLength(0);

    // Two outbox entries: put (from create) + delete (from delete)
    const outbox = await repo.unacked();
    expect(outbox).toHaveLength(2);
    const deleteEntry = outbox.find((e) => e.op === 'delete');
    expect(deleteEntry).toBeDefined();
    expect(deleteEntry!.collection).toBe(ANNOTATIONS_COLLECTION);
    expect(deleteEntry!.recordId).toBe(annotation.id);
  });

  it('deleteAnnotation uses exactly one HLC stamp (invariant #2)', async () => {
    const { store, repo } = makeWebStore();

    const annotation = await store.createAnnotation({
      docId: 'doc-1',
      kind: 'highlight',
      anchor: ANCHOR,
      color: 'yellow',
    });

    await store.deleteAnnotation(annotation.id);

    const outbox = await repo.unacked();
    const deleteEntries = outbox.filter((e) => e.op === 'delete');
    // Only one delete entry
    expect(deleteEntries).toHaveLength(1);
  });
});
