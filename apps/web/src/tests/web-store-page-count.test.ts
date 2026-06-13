/**
 * web-store-page-count.test.ts — store-surface coverage for setDocumentPageCount
 * on the WebStore facade.
 *
 * Mirrors web-store-reading-position.test.ts's makeWebStore() harness:
 * MemoryRepository + MemoryBlobStore + subtleCryptoHasher + createWebClock over makeStorage().
 *
 * These tests confirm the plumbing (WebStore correctly delegates to @ember/store with
 * the right clock/repo deps) rather than re-testing the core 09a logic.
 */

import { describe, expect, it } from 'vitest';

import { DOCUMENTS_COLLECTION, MemoryBlobStore, MemoryRepository } from '@ember/store';

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
  const repo = new MemoryRepository();
  const store = createWebStore({
    repo,
    blobs: new MemoryBlobStore(),
    hasher: subtleCryptoHasher,
    clock: createWebClock({
      storage: makeStorage(),
      now: () => 1_000_000,
      newId: () => `id-${(++counter).toString()}`,
    }),
  });
  return { store, repo };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WebStore page-count surface', () => {
  it('setDocumentPageCount returns updated doc with pageCount and adds exactly one outbox entry beyond import', async () => {
    const { store, repo } = makeWebStore();

    // Seed: import a real PDF file so the document exists
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF magic bytes
    const file = new File([pdfBytes], 'test.pdf', { type: 'application/pdf' });
    const { document: doc } = await store.importPdf(file);
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

    // Document record reflects pageCount
    const stored = await repo.get(DOCUMENTS_COLLECTION, docId);
    expect(stored).not.toBeNull();
    expect((stored as { pageCount?: number }).pageCount).toBe(42);

    // Exactly ONE new outbox entry beyond the import entry
    const outboxAfterSet = await repo.unacked();
    expect(outboxAfterSet.length).toBe(importEntryCount + 1);

    // The new entry is for the document record
    const newEntry = outboxAfterSet.find(
      (e) => e.collection === DOCUMENTS_COLLECTION && e.recordId === docId && e.op === 'put'
        && outboxAfterImport.every((old) => old.id !== e.id),
    );
    expect(newEntry).toBeDefined();
  });

  it('setDocumentPageCount is idempotent — calling again with same count adds no further outbox entry', async () => {
    const { store, repo } = makeWebStore();

    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const file = new File([pdfBytes], 'test.pdf', { type: 'application/pdf' });
    const { document: doc } = await store.importPdf(file);
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

  it('setDocumentPageCount returns null for a missing document and writes nothing', async () => {
    const { store, repo } = makeWebStore();

    const result = await store.setDocumentPageCount('nonexistent-id', 50);

    expect(result).toBeNull();

    // No document record
    const stored = await repo.get(DOCUMENTS_COLLECTION, 'nonexistent-id');
    expect(stored == null).toBe(true); // undefined or null — repo returns undefined for missing

    // No outbox entry
    const outbox = await repo.unacked();
    expect(outbox).toHaveLength(0);
  });
});
