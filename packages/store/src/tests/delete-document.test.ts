import { describe, expect, it } from 'vitest';

import type { Hasher, TextAnchor } from '@ember/core';
import {
  DOC_TAGS_COLLECTION,
  initialClock,
  makeAnnotation,
  makeDocTag,
  makeReadingPosition,
  makeReadingSession,
  tick,
} from '@ember/core';

import { ANNOTATIONS_COLLECTION } from '../annotations.js';
import { DOCUMENTS_COLLECTION, deleteDocument, importDocument } from '../documents.js';
import { MemoryBlobStore } from '../memory-blob-store.js';
import { MemoryRepository } from '../memory-repository.js';
import { READING_POSITIONS_COLLECTION } from '../reading-positions.js';
import { SESSIONS_COLLECTION } from '../sessions.js';

// Deterministic hasher: encode each byte as two hex chars (collision-free for distinct inputs).
function makeFakeHasher(): Hasher {
  return {
    sha256Hex: async (bytes: Uint8Array): Promise<string> =>
      Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(''),
  };
}

const anchor: TextAnchor = { kind: 'text', page: 1, startChar: 0, endChar: 5, quote: 'hello' };

function makeDeps() {
  const repo = new MemoryRepository();
  const blobs = new MemoryBlobStore();
  const hasher = makeFakeHasher();

  let clock = tick(initialClock('test-node'), 1_000_000);
  let physical = 1_700_000_000_000;
  const nextStamp = () => {
    physical += 1;
    clock = tick(clock, physical);
    return clock;
  };

  let outboxCounter = 0;
  const newOutboxId = () => `outbox-${(++outboxCounter).toString()}`;

  return { repo, blobs, hasher, nextStamp, newOutboxId, hlc: tick(initialClock('seed'), 1) };
}

/** Import a doc and seed a tag link, annotation, reading position, and session — all via
 *  direct repo.put/blob.put so the ONLY outbox entries observed come from deleteDocument. */
async function seedDoc(deps: ReturnType<typeof makeDeps>) {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const { document } = await importDocument(
    { ...deps, now: 1_700_000_000_000 },
    { bytes, filename: 'novel.pdf', contentType: 'application/pdf' },
  );
  const docId = document.id;

  await deps.repo.put(
    DOC_TAGS_COLLECTION,
    makeDocTag({ documentId: docId, tagId: 'tag-1', createdAt: 1 }, { hlc: deps.hlc }),
  );
  await deps.repo.put(
    ANNOTATIONS_COLLECTION,
    makeAnnotation(
      { id: 'ann-1', docId, kind: 'highlight', anchor, color: 'yellow', createdAt: 1 },
      { hlc: deps.hlc },
    ),
  );
  await deps.repo.put(
    READING_POSITIONS_COLLECTION,
    makeReadingPosition({ id: docId, page: 3, offset: 0, hlc: deps.hlc }),
  );
  await deps.repo.put(
    SESSIONS_COLLECTION,
    makeReadingSession(
      {
        docId,
        localDay: '2024-03-15',
        tzOffsetMinutes: 0,
        startedAt: 0,
        endedAt: 45_000,
        activeMs: 45_000,
        pages: [1, 2, 3],
      },
      { id: 'session-1', hlc: deps.hlc },
    ),
  );

  return docId;
}

describe('deleteDocument', () => {
  it('removes the document, blob, tag links, annotations, and reading position', async () => {
    const deps = makeDeps();
    const docId = await seedDoc(deps);

    await deleteDocument(deps, docId);

    expect(await deps.repo.get(DOCUMENTS_COLLECTION, docId)).toBeUndefined();
    expect(await deps.blobs.get(docId)).toBeUndefined();
    expect(await deps.repo.get(READING_POSITIONS_COLLECTION, docId)).toBeUndefined();
    expect(await deps.repo.query(DOC_TAGS_COLLECTION)).toHaveLength(0);
    expect(await deps.repo.query(ANNOTATIONS_COLLECTION)).toHaveLength(0);
  });

  it('preserves reading sessions (invariant #3 — immutable history)', async () => {
    const deps = makeDeps();
    const docId = await seedDoc(deps);

    await deleteDocument(deps, docId);

    const session = await deps.repo.get(SESSIONS_COLLECTION, 'session-1');
    expect(session).toBeDefined();
    // No session delete tombstone was enqueued
    const entries = await deps.repo.unacked();
    expect(entries.some((e) => e.collection === SESSIONS_COLLECTION)).toBe(false);
  });

  it('enqueues one delete tombstone per removed record (doc, tag link, annotation, position)', async () => {
    const deps = makeDeps();
    const docId = await seedDoc(deps);

    await deleteDocument(deps, docId);

    const entries = await deps.repo.unacked();
    const deletes = entries.filter((e) => e.op === 'delete');
    expect(deletes).toHaveLength(4);
    expect(deletes.map((e) => e.collection).sort()).toEqual(
      [ANNOTATIONS_COLLECTION, DOCUMENTS_COLLECTION, DOC_TAGS_COLLECTION, READING_POSITIONS_COLLECTION].sort(),
    );
    // Every tombstone has a unique outbox id.
    expect(new Set(deletes.map((e) => e.id)).size).toBe(4);
  });

  it('a document with no owned records still tombstones the document itself', async () => {
    const deps = makeDeps();
    const bytes = new Uint8Array([9, 9, 9]);
    const { document } = await importDocument(
      { ...deps, now: 1_700_000_000_000 },
      { bytes, filename: 'lonely.pdf', contentType: 'application/pdf' },
    );

    await deleteDocument(deps, document.id);

    expect(await deps.repo.get(DOCUMENTS_COLLECTION, document.id)).toBeUndefined();
    expect(await deps.blobs.get(document.id)).toBeUndefined();
    const deletes = (await deps.repo.unacked()).filter((e) => e.op === 'delete');
    expect(deletes).toHaveLength(1);
    expect(deletes[0]!.collection).toBe(DOCUMENTS_COLLECTION);
  });
});
