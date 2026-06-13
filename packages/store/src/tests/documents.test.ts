import { describe, expect, it } from 'vitest';

import { initialClock, tick } from '@ember/core';
import type { Document, Hasher } from '@ember/core';

import { DOCUMENTS_COLLECTION, importDocument, listDocuments, setDocumentPageCount } from '../documents.js';
import { MemoryBlobStore } from '../memory-blob-store.js';
import { MemoryRepository } from '../memory-repository.js';

/**
 * Deterministic fake Hasher: returns a stable hex digest based on the sum of byte values.
 * Provides determinism and collision-freedom for distinct test inputs without real crypto.
 */
function makeFakeHasher(): Hasher {
  return {
    sha256Hex: async (bytes: Uint8Array): Promise<string> => {
      // Simple deterministic digest: encode each byte as two hex chars.
      // Collision-free for the small, distinct test inputs used here.
      return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    },
  };
}

function makeTestDeps(overrides?: { now?: number }) {
  const repo = new MemoryRepository();
  const blobs = new MemoryBlobStore();
  const hasher = makeFakeHasher();
  const hlc = tick(initialClock('test-node'), 1_000_000);
  let outboxCounter = 0;
  const newOutboxId = () => `outbox-${++outboxCounter}`;

  return {
    repo,
    blobs,
    hasher,
    hlc,
    now: overrides?.now ?? 1_700_000_000_000,
    newOutboxId,
  };
}

describe('importDocument', () => {
  it('import-new: persists record + blob + exactly one outbox entry', async () => {
    const deps = makeTestDeps();
    const bytes = new Uint8Array([1, 2, 3]);

    const result = await importDocument(deps, {
      bytes,
      filename: 'test.pdf',
      contentType: 'application/pdf',
    });

    expect(result.deduped).toBe(false);
    expect(result.document.filename).toBe('test.pdf');

    // Record persisted
    const stored = await deps.repo.get(DOCUMENTS_COLLECTION, result.document.id);
    expect(stored).toEqual(result.document);

    // Blob persisted
    const storedBlob = await deps.blobs.get(result.document.id);
    expect(storedBlob).toEqual(bytes);

    // Exactly one outbox entry
    const entries = await deps.repo.unacked();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.recordId).toBe(result.document.id);
    expect(entries[0]!.collection).toBe(DOCUMENTS_COLLECTION);
    expect(entries[0]!.op).toBe('put');
  });

  it('re-import identical bytes → deduped: true, still one record and one outbox entry, blob untouched', async () => {
    const deps = makeTestDeps();
    const bytes = new Uint8Array([10, 20, 30]);

    const first = await importDocument(deps, {
      bytes,
      filename: 'doc.pdf',
      contentType: 'application/pdf',
    });

    // Overwrite the stored blob with a sentinel to verify it is NOT overwritten on re-import
    await deps.blobs.put(first.document.id, new Uint8Array([0xff]));

    const second = await importDocument(deps, {
      bytes,
      filename: 'doc.pdf',
      contentType: 'application/pdf',
    });

    expect(second.deduped).toBe(true);
    expect(second.document.id).toBe(first.document.id);

    // Still only one outbox entry from the original import
    const entries = await deps.repo.unacked();
    expect(entries).toHaveLength(1);

    // Blob was NOT overwritten — sentinel value preserved
    const storedBlob = await deps.blobs.get(first.document.id);
    expect(storedBlob).toEqual(new Uint8Array([0xff]));
  });

  it('different bytes → distinct id, second record + second outbox entry', async () => {
    const deps = makeTestDeps();

    const r1 = await importDocument(deps, {
      bytes: new Uint8Array([1, 2, 3]),
      filename: 'a.pdf',
      contentType: 'application/pdf',
    });
    const r2 = await importDocument(deps, {
      bytes: new Uint8Array([4, 5, 6]),
      filename: 'b.pdf',
      contentType: 'application/pdf',
    });

    expect(r1.document.id).not.toBe(r2.document.id);
    expect(r1.deduped).toBe(false);
    expect(r2.deduped).toBe(false);

    const entries = await deps.repo.unacked();
    expect(entries).toHaveLength(2);
  });

  it('title derives from filename when not provided', async () => {
    const deps = makeTestDeps();

    const result = await importDocument(deps, {
      bytes: new Uint8Array([7, 8]),
      filename: 'annual-report.pdf',
      contentType: 'application/pdf',
    });

    expect(result.document.title).toBe('annual-report');
  });

  it('title can be overridden', async () => {
    const deps = makeTestDeps();

    const result = await importDocument(deps, {
      bytes: new Uint8Array([11, 12]),
      filename: 'doc.pdf',
      contentType: 'application/pdf',
      title: 'Custom Title',
    });

    expect(result.document.title).toBe('Custom Title');
  });

  it('record id equals the hash of the bytes', async () => {
    const deps = makeTestDeps();
    const bytes = new Uint8Array([0xca, 0xfe]);
    // Fake hasher encodes each byte as 2 hex chars: ca + fe = "cafe"
    const expectedId = 'cafe';

    const result = await importDocument(deps, {
      bytes,
      filename: 'test.pdf',
      contentType: 'application/pdf',
    });

    expect(result.document.id).toBe(expectedId);
  });
});

describe('listDocuments', () => {
  it('returns all imported documents', async () => {
    const deps = makeTestDeps();

    await importDocument(deps, {
      bytes: new Uint8Array([1]),
      filename: 'a.pdf',
      contentType: 'application/pdf',
    });
    await importDocument(deps, {
      bytes: new Uint8Array([2]),
      filename: 'b.pdf',
      contentType: 'application/pdf',
    });

    const docs = await listDocuments(deps.repo);
    expect(docs).toHaveLength(2);
    const filenames = docs.map((d) => d.filename).sort();
    expect(filenames).toEqual(['a.pdf', 'b.pdf']);
  });

  it('returns empty list when no documents imported', async () => {
    const repo = new MemoryRepository();
    const docs = await listDocuments(repo);
    expect(docs).toEqual([]);
  });
});

describe('setDocumentPageCount', () => {
  async function seedDoc(deps: ReturnType<typeof makeTestDeps>) {
    const result = await importDocument(deps, {
      bytes: new Uint8Array([5, 6, 7]),
      filename: 'seed.pdf',
      contentType: 'application/pdf',
    });
    return result.document;
  }

  it('missing doc → returns null, no write, no new outbox entry', async () => {
    const deps = makeTestDeps();
    const entriesBefore = await deps.repo.unacked();
    const result = await setDocumentPageCount(deps, 'nonexistent-id', 10);
    expect(result).toBeNull();
    const entriesAfter = await deps.repo.unacked();
    expect(entriesAfter).toHaveLength(entriesBefore.length);
  });

  it('fresh set → returns updated doc; repo.get reflects it; exactly one new outbox entry', async () => {
    const deps = makeTestDeps();
    const doc = await seedDoc(deps);
    const entriesBefore = await deps.repo.unacked();

    const result = await setDocumentPageCount(deps, doc.id, 300);

    expect(result).not.toBeNull();
    expect(result!.pageCount).toBe(300);

    const stored = await deps.repo.get(DOCUMENTS_COLLECTION, doc.id);
    expect(stored).toEqual(result);

    const entriesAfter = await deps.repo.unacked();
    const newEntries = entriesAfter.slice(entriesBefore.length);
    expect(newEntries).toHaveLength(1);
    expect(newEntries[0]!.op).toBe('put');
    expect(newEntries[0]!.recordId).toBe(doc.id);
    expect(newEntries[0]!.payload).toEqual(result);
  });

  it('idempotent → same count again returns record, adds no further outbox entry', async () => {
    const deps = makeTestDeps();
    const doc = await seedDoc(deps);

    await setDocumentPageCount(deps, doc.id, 200);
    const entriesAfterFirst = await deps.repo.unacked();

    const result = await setDocumentPageCount(deps, doc.id, 200);
    const entriesAfterSecond = await deps.repo.unacked();

    expect(result!.pageCount).toBe(200);
    expect(entriesAfterSecond).toHaveLength(entriesAfterFirst.length);
  });

  it('change → different valid count overwrites and enqueues one more outbox entry', async () => {
    const deps = makeTestDeps();
    const doc = await seedDoc(deps);

    await setDocumentPageCount(deps, doc.id, 100);
    const entriesAfterFirst = await deps.repo.unacked();

    const result = await setDocumentPageCount(deps, doc.id, 150);
    const entriesAfterSecond = await deps.repo.unacked();

    expect(result!.pageCount).toBe(150);
    expect(entriesAfterSecond).toHaveLength(entriesAfterFirst.length + 1);
  });

  it('invalid count (0) on a doc with no stored count → throws RangeError, writes nothing', async () => {
    const deps = makeTestDeps();
    const doc = await seedDoc(deps);
    const entriesBefore = await deps.repo.unacked();

    await expect(setDocumentPageCount(deps, doc.id, 0)).rejects.toThrow(RangeError);

    const stored = await deps.repo.get<Document>(DOCUMENTS_COLLECTION, doc.id);
    expect(stored?.pageCount).toBeUndefined();
    const entriesAfter = await deps.repo.unacked();
    expect(entriesAfter).toHaveLength(entriesBefore.length);
  });
});
