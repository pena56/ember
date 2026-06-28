/**
 * native-store-tags.test.ts — seam tests for tag / doc-tag / smart-view methods
 * on the NativeStore (Unit 15c).
 *
 * Mirrors web-store-tags.test.ts (15b) and the native-store-duplicate-decision
 * pattern: injected MemoryRepository + MemoryBlobStore + createNativeClock.
 *
 * Asserts:
 *   - exactly-one-record + exactly-one-outbox-entry per write (invariant #2)
 *   - entry.hlc === record.updatedAt (same HLC stamp, invariant #2)
 *   - delete writes a payload-less tombstone and removes the record
 *   - tagDoc uses deterministic docTagId (same pair → same id, LWW upsert)
 *   - reads return stored records
 */

import { describe, expect, it } from 'vitest';

import type { Hasher } from '@ember/core';
import { DOC_TAGS_COLLECTION, SMART_VIEWS_COLLECTION, TAGS_COLLECTION, docTagId } from '@ember/core';
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

// ── Tag tests ─────────────────────────────────────────────────────────────────

describe('NativeStore tag surface (15c)', () => {
  it('listTags returns [] initially', async () => {
    const { store } = makeDeps();
    expect(await store.listTags()).toEqual([]);
  });

  it('createTag writes one record + one put outbox entry with hlc === updatedAt (invariant #2)', async () => {
    const { store, repo } = makeDeps();

    const tag = await store.createTag({ name: 'Fiction', color: 'blue' });

    expect(tag.name).toBe('Fiction');
    expect(tag.color).toBe('blue');
    expect(typeof tag.id).toBe('string');
    expect(typeof tag.updatedAt).toBe('string');

    const records = await repo.query(TAGS_COLLECTION);
    expect(records).toHaveLength(1);

    const outbox = await repo.unacked();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ collection: TAGS_COLLECTION, op: 'put', recordId: tag.id });
    // Invariant #2: entry.hlc === record.updatedAt
    expect(outbox[0]!.hlc).toBe(tag.updatedAt);
  });

  it('createTag defaults color to gray when omitted', async () => {
    const { store } = makeDeps();
    const tag = await store.createTag({ name: 'Uncolored' });
    expect(tag.color).toBe('gray');
  });

  it('listTags reads back stored tags', async () => {
    const { store } = makeDeps();
    await store.createTag({ name: 'A', color: 'red' });
    await store.createTag({ name: 'B', color: 'green' });
    const tags = await store.listTags();
    expect(tags).toHaveLength(2);
    const names = tags.map((t) => t.name).sort();
    expect(names).toEqual(['A', 'B']);
  });

  it('editTag updates name/color + writes one put outbox entry with hlc === updatedAt', async () => {
    const { store, repo } = makeDeps();
    const tag = await store.createTag({ name: 'Old', color: 'gray' });

    const edited = await store.editTag({ tag, patch: { name: 'New', color: 'purple' } });

    expect(edited.id).toBe(tag.id);
    expect(edited.name).toBe('New');
    expect(edited.color).toBe('purple');
    expect(edited.createdAt).toBe(tag.createdAt);
    expect(edited.updatedAt).not.toBe(tag.updatedAt);

    const records = await repo.query(TAGS_COLLECTION);
    expect(records).toHaveLength(1); // upserted, not duplicated

    const outbox = await repo.unacked();
    const putEntries = outbox.filter((e) => e.op === 'put');
    expect(putEntries).toHaveLength(2); // create + edit
    const editEntry = putEntries[1]!;
    expect(editEntry.hlc).toBe(edited.updatedAt);
  });

  it('deleteTag removes the record + enqueues a payload-less delete tombstone (invariant #2)', async () => {
    const { store, repo } = makeDeps();
    const tag = await store.createTag({ name: 'Gone' });

    await store.deleteTag(tag.id);

    const records = await repo.query(TAGS_COLLECTION);
    expect(records).toHaveLength(0);

    const outbox = await repo.unacked();
    const deleteEntry = outbox.find((e) => e.op === 'delete');
    expect(deleteEntry).toBeDefined();
    expect(deleteEntry!.collection).toBe(TAGS_COLLECTION);
    expect(deleteEntry!.recordId).toBe(tag.id);
    // payload-less tombstone
    expect(deleteEntry!.payload).toBeUndefined();
  });
});

// ── DocTag tests ──────────────────────────────────────────────────────────────

describe('NativeStore doc-tag surface (15c)', () => {
  it('listDocTags returns [] initially', async () => {
    const { store } = makeDeps();
    expect(await store.listDocTags()).toEqual([]);
  });

  it('tagDoc uses deterministic docTagId (same pair → same id, re-tag converges)', async () => {
    const { store, repo } = makeDeps();

    const dt1 = await store.tagDoc({ documentId: 'doc-1', tagId: 'tag-1' });
    const expectedId = docTagId('doc-1', 'tag-1');

    expect(dt1.id).toBe(expectedId);

    // Re-tag same pair → same id, higher HLC (LWW upsert)
    const dt2 = await store.tagDoc({ documentId: 'doc-1', tagId: 'tag-1' });
    expect(dt2.id).toBe(expectedId);
    expect(dt2.updatedAt > dt1.updatedAt).toBe(true); // HLC advances

    // Only one record (upserted)
    const records = await repo.query(DOC_TAGS_COLLECTION);
    expect(records).toHaveLength(1);
  });

  it('tagDoc writes one record + one put outbox entry with hlc === updatedAt (invariant #2)', async () => {
    const { store, repo } = makeDeps();

    const dt = await store.tagDoc({ documentId: 'doc-a', tagId: 'tag-x' });

    const outbox = await repo.unacked();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      collection: DOC_TAGS_COLLECTION,
      op: 'put',
      recordId: dt.id,
    });
    expect(outbox[0]!.hlc).toBe(dt.updatedAt);
  });

  it('listDocTags reads back stored links', async () => {
    const { store } = makeDeps();
    await store.tagDoc({ documentId: 'doc-1', tagId: 'tag-1' });
    await store.tagDoc({ documentId: 'doc-1', tagId: 'tag-2' });
    await store.tagDoc({ documentId: 'doc-2', tagId: 'tag-1' });
    const dts = await store.listDocTags();
    expect(dts).toHaveLength(3);
  });

  it('untagDoc removes the link + enqueues a payload-less delete tombstone (invariant #2)', async () => {
    const { store, repo } = makeDeps();
    const dt = await store.tagDoc({ documentId: 'doc-1', tagId: 'tag-1' });

    await store.untagDoc({ documentId: 'doc-1', tagId: 'tag-1' });

    const records = await repo.query(DOC_TAGS_COLLECTION);
    expect(records).toHaveLength(0);

    const outbox = await repo.unacked();
    const deleteEntry = outbox.find((e) => e.op === 'delete');
    expect(deleteEntry).toBeDefined();
    expect(deleteEntry!.collection).toBe(DOC_TAGS_COLLECTION);
    expect(deleteEntry!.recordId).toBe(dt.id);
    expect(deleteEntry!.payload).toBeUndefined();
  });
});

// ── SmartView tests ───────────────────────────────────────────────────────────

describe('NativeStore smart-view surface (15c)', () => {
  it('listSmartViews returns [] initially', async () => {
    const { store } = makeDeps();
    expect(await store.listSmartViews()).toEqual([]);
  });

  it('createSmartView writes one record + one put outbox entry with hlc === updatedAt (invariant #2)', async () => {
    const { store, repo } = makeDeps();

    const view = await store.createSmartView({
      name: 'Sci-Fi',
      query: { tagIds: ['tag-1'], tagMatch: 'any' },
    });

    expect(view.name).toBe('Sci-Fi');
    expect(view.query).toEqual({ tagIds: ['tag-1'], tagMatch: 'any' });

    const records = await repo.query(SMART_VIEWS_COLLECTION);
    expect(records).toHaveLength(1);

    const outbox = await repo.unacked();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      collection: SMART_VIEWS_COLLECTION,
      op: 'put',
      recordId: view.id,
    });
    expect(outbox[0]!.hlc).toBe(view.updatedAt);
  });

  it('listSmartViews reads back stored views', async () => {
    const { store } = makeDeps();
    await store.createSmartView({ name: 'A', query: {} });
    await store.createSmartView({ name: 'B', query: { state: 'in-progress' } });
    const views = await store.listSmartViews();
    expect(views).toHaveLength(2);
  });

  it('editSmartView updates name/query + writes one put outbox entry with hlc === updatedAt', async () => {
    const { store, repo } = makeDeps();
    const view = await store.createSmartView({ name: 'Old', query: {} });

    const edited = await store.editSmartView({
      view,
      patch: { name: 'Renamed', query: { state: 'finished' } },
    });

    expect(edited.id).toBe(view.id);
    expect(edited.name).toBe('Renamed');
    expect(edited.query).toEqual({ state: 'finished' });
    expect(edited.updatedAt).not.toBe(view.updatedAt);

    const records = await repo.query(SMART_VIEWS_COLLECTION);
    expect(records).toHaveLength(1);

    const outbox = await repo.unacked();
    const putEntries = outbox.filter((e) => e.op === 'put');
    expect(putEntries[1]!.hlc).toBe(edited.updatedAt);
  });

  it('deleteSmartView removes the record + enqueues a payload-less delete tombstone (invariant #2)', async () => {
    const { store, repo } = makeDeps();
    const view = await store.createSmartView({ name: 'To Delete', query: {} });

    await store.deleteSmartView(view.id);

    const records = await repo.query(SMART_VIEWS_COLLECTION);
    expect(records).toHaveLength(0);

    const outbox = await repo.unacked();
    const deleteEntry = outbox.find((e) => e.op === 'delete');
    expect(deleteEntry).toBeDefined();
    expect(deleteEntry!.collection).toBe(SMART_VIEWS_COLLECTION);
    expect(deleteEntry!.recordId).toBe(view.id);
    expect(deleteEntry!.payload).toBeUndefined();
  });
});
