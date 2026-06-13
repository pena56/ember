import { describe, expect, it } from 'vitest';

import { initialClock, makeAnnotation, tick, type TextAnchor } from '@ember/core';

import {
  ANNOTATIONS_COLLECTION,
  deleteAnnotation,
  listAnnotations,
  saveAnnotation,
} from '../annotations.js';
import { MemoryRepository } from '../memory-repository.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const hlc1 = tick(initialClock('node-a'), 1_000_000);
const hlc2 = tick(hlc1, 2_000_000);

const baseAnchor: TextAnchor = {
  kind: 'text',
  page: 1,
  startChar: 0,
  endChar: 5,
  quote: 'hello',
};

function makeTestDeps(hlc = hlc1) {
  const repo = new MemoryRepository();
  let outboxCounter = 0;
  const newOutboxId = () => `outbox-${++outboxCounter}`;
  return { repo, hlc, newOutboxId };
}

function makeTestAnnotation(id: string, docId: string, note?: string) {
  return makeAnnotation(
    {
      id,
      docId,
      kind: 'highlight',
      anchor: baseAnchor,
      color: 'yellow',
      ...(note !== undefined ? { note } : {}),
      createdAt: 1_000_000,
    },
    { hlc: hlc1 },
  );
}

// ---------------------------------------------------------------------------
// saveAnnotation — create
// ---------------------------------------------------------------------------

describe('saveAnnotation — create', () => {
  it('writes exactly one record + exactly one outbox entry', async () => {
    const deps = makeTestDeps();
    const ann = makeTestAnnotation('ann-1', 'doc-1');

    await saveAnnotation(deps, ann);

    // One record stored
    const stored = await deps.repo.get(ANNOTATIONS_COLLECTION, ann.id);
    expect(stored).toEqual(ann);

    // Exactly one outbox entry
    const entries = await deps.repo.unacked();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.op).toBe('put');
    expect(entries[0]!.recordId).toBe(ann.id);
    expect(entries[0]!.collection).toBe(ANNOTATIONS_COLLECTION);
    expect(entries[0]!.payload).toEqual(ann);
  });

  it('returns the annotation', async () => {
    const deps = makeTestDeps();
    const ann = makeTestAnnotation('ann-1', 'doc-1');
    const result = await saveAnnotation(deps, ann);
    expect(result).toEqual(ann);
  });

  it('listAnnotations returns the saved annotation', async () => {
    const deps = makeTestDeps();
    const ann = makeTestAnnotation('ann-1', 'doc-1');
    await saveAnnotation(deps, ann);

    const list = await listAnnotations(deps.repo);
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual(ann);
  });
});

// ---------------------------------------------------------------------------
// saveAnnotation — upsert (edit)
// ---------------------------------------------------------------------------

describe('saveAnnotation — upsert (edit)', () => {
  it('second save with same id produces ONE record (upserted) + TWO outbox entries total', async () => {
    const deps = makeTestDeps();
    const ann1 = makeTestAnnotation('ann-1', 'doc-1');
    await saveAnnotation(deps, ann1);

    // Edit: rebuild with updated hlc
    const ann2 = makeAnnotation(
      { id: 'ann-1', docId: 'doc-1', kind: 'highlight', anchor: baseAnchor, color: 'pink', createdAt: 1_000_000 },
      { hlc: hlc2 },
    );
    await saveAnnotation({ ...deps, hlc: hlc2 }, ann2);

    // Still only one record with the same id (upserted)
    const list = await listAnnotations(deps.repo);
    expect(list).toHaveLength(1);
    expect(list[0]!.color).toBe('pink');

    // Two outbox entries (mutation-log append)
    const entries = await deps.repo.unacked();
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.recordId === 'ann-1')).toBe(true);
    expect(entries.every((e) => e.op === 'put')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// deleteAnnotation
// ---------------------------------------------------------------------------

describe('deleteAnnotation', () => {
  it('removes the record and enqueues exactly one delete entry', async () => {
    const deps = makeTestDeps();
    const ann = makeTestAnnotation('ann-del', 'doc-1');
    await saveAnnotation(deps, ann);

    await deleteAnnotation(deps, ann.id);

    // Record gone
    const stored = await deps.repo.get(ANNOTATIONS_COLLECTION, ann.id);
    expect(stored).toBeUndefined();

    // listAnnotations no longer contains it
    const list = await listAnnotations(deps.repo);
    expect(list.some((a) => a.id === ann.id)).toBe(false);

    // Two total outbox entries: one put (from save), one delete
    const entries = await deps.repo.unacked();
    expect(entries).toHaveLength(2);
    const delEntry = entries.find((e) => e.op === 'delete');
    expect(delEntry).toBeDefined();
    expect(delEntry!.recordId).toBe(ann.id);
    expect(delEntry!.collection).toBe(ANNOTATIONS_COLLECTION);
    expect('payload' in delEntry!).toBe(false);
  });

  it('is idempotent at the repo layer (delete of absent id enqueues tombstone)', async () => {
    const deps = makeTestDeps();
    // Delete without any prior save — should not throw
    await expect(deleteAnnotation(deps, 'nonexistent-id')).resolves.toBeUndefined();

    // Tombstone still enqueued for sync
    const entries = await deps.repo.unacked();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.op).toBe('delete');
    expect(entries[0]!.recordId).toBe('nonexistent-id');
  });
});

// ---------------------------------------------------------------------------
// listAnnotations — filtering
// ---------------------------------------------------------------------------

describe('listAnnotations', () => {
  async function setup() {
    const deps = makeTestDeps();
    const ann1 = makeTestAnnotation('ann-1', 'doc-A');
    const ann2 = makeTestAnnotation('ann-2', 'doc-A');
    const ann3 = makeTestAnnotation('ann-3', 'doc-B');
    await saveAnnotation(deps, ann1);
    await saveAnnotation(deps, ann2);
    await saveAnnotation(deps, ann3);
    return { deps, ann1, ann2, ann3 };
  }

  it('no-filter returns all annotations', async () => {
    const { deps } = await setup();
    const list = await listAnnotations(deps.repo);
    expect(list).toHaveLength(3);
  });

  it('filters by docId correctly', async () => {
    const { deps } = await setup();
    const list = await listAnnotations(deps.repo, 'doc-A');
    expect(list).toHaveLength(2);
    expect(list.every((a) => a.docId === 'doc-A')).toBe(true);
  });

  it('filters to empty when docId matches nothing', async () => {
    const { deps } = await setup();
    const list = await listAnnotations(deps.repo, 'doc-Z');
    expect(list).toHaveLength(0);
  });

  it('multi-doc isolation holds', async () => {
    const { deps } = await setup();
    const listA = await listAnnotations(deps.repo, 'doc-A');
    const listB = await listAnnotations(deps.repo, 'doc-B');
    expect(listA).toHaveLength(2);
    expect(listB).toHaveLength(1);
    expect(listB[0]!.docId).toBe('doc-B');
  });

  it('returns empty array when no annotations saved', async () => {
    const repo = new MemoryRepository();
    const list = await listAnnotations(repo);
    expect(list).toEqual([]);
  });
});
