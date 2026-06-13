/**
 * native-store-page-count.test.ts — thin seam test for setDocumentPageCount
 * on the NativeStore wrapper (09c).
 *
 * Mirrors native-store-reading-position.test.ts structure: MemoryRepository +
 * MemoryBlobStore + fake Hasher + injected clock. We assert the seam (one record +
 * one outbox entry), NOT the 09a internals that are already tested in packages/store.
 */

import { describe, expect, it } from 'vitest';

import type { Hasher } from '@ember/core';
import { DOCUMENTS_COLLECTION, MemoryBlobStore, MemoryRepository } from '@ember/store';

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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('setDocumentPageCount', () => {
  it('returns updated doc with pageCount and adds exactly one new outbox entry beyond import', async () => {
    const { store, repo } = makeDeps();

    // Seed: import a document so it exists in the repo
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF magic bytes
    const { document: doc } = await store.importPdf(pdfBytes, 'test.pdf');
    const docId = doc.id;

    // Count outbox entries after import
    const outboxAfterImport = await repo.unacked();
    const importEntryCount = outboxAfterImport.length;

    // Act
    const updated = await store.setDocumentPageCount(docId, 42);

    // Returns the updated document
    expect(updated).not.toBeNull();
    expect(updated!.id).toBe(docId);
    expect(updated!.pageCount).toBe(42);

    // Document record in repo reflects pageCount
    const stored = await repo.get(DOCUMENTS_COLLECTION, docId);
    expect(stored).not.toBeNull();
    expect((stored as { pageCount?: number }).pageCount).toBe(42);

    // Exactly ONE new outbox entry beyond the import entry
    const outboxAfterSet = await repo.unacked();
    expect(outboxAfterSet.length).toBe(importEntryCount + 1);

    // The new entry is for the document record
    const newEntry = outboxAfterSet.find(
      (e) =>
        e.collection === DOCUMENTS_COLLECTION &&
        e.recordId === docId &&
        e.op === 'put' &&
        outboxAfterImport.every((old) => old.id !== e.id),
    );
    expect(newEntry).toBeDefined();
  });

  it('is idempotent — calling again with the same count adds no further outbox entry', async () => {
    const { store, repo } = makeDeps();

    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const { document: doc } = await store.importPdf(pdfBytes, 'test.pdf');
    const docId = doc.id;

    await store.setDocumentPageCount(docId, 100);
    const outboxAfterFirst = await repo.unacked();
    const countAfterFirst = outboxAfterFirst.length;

    // Call again with same count
    const result = await store.setDocumentPageCount(docId, 100);
    expect(result).not.toBeNull();
    expect(result!.pageCount).toBe(100);

    // No additional outbox entry
    const outboxAfterSecond = await repo.unacked();
    expect(outboxAfterSecond.length).toBe(countAfterFirst);
  });

  it('returns null for a missing document and writes nothing', async () => {
    const { store, repo } = makeDeps();

    const result = await store.setDocumentPageCount('nonexistent-id', 50);

    expect(result).toBeNull();

    // No document record
    const stored = await repo.get(DOCUMENTS_COLLECTION, 'nonexistent-id');
    expect(stored == null).toBe(true);

    // No outbox entry
    const outbox = await repo.unacked();
    expect(outbox).toHaveLength(0);
  });
});
