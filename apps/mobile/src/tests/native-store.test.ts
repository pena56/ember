import { describe, expect, it } from 'vitest';

import type { Hasher } from '@ember/core';
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
const fakeNewId = () => `id-${(++counter).toString()}`;

/**
 * Deterministic hasher: SHA-256 of bytes is modelled as a hex of the sum of all byte values.
 * Different byte arrays (unless trivially equal) produce different hashes.
 */
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
  // Return the repo too so tests can assert the outbox directly (invariant #2).
  return { store, repo };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createNativeStore', () => {
  it('importing bytes adds exactly one Document', async () => {
    const { store } = makeDeps();
    const bytes = new Uint8Array([1, 2, 3]);
    const result = await store.importPdf(bytes, 'test.pdf');
    expect(result.deduped).toBe(false);
    const docs = await store.listDocuments();
    expect(docs).toHaveLength(1);
    expect(docs[0]!.filename).toBe('test.pdf');
  });

  it('importing the same bytes again returns deduped: true and adds no second record', async () => {
    const { store } = makeDeps();
    const bytes = new Uint8Array([10, 20, 30]);

    const r1 = await store.importPdf(bytes, 'first.pdf');
    expect(r1.deduped).toBe(false);

    const r2 = await store.importPdf(bytes, 'first.pdf');
    expect(r2.deduped).toBe(true);

    const docs = await store.listDocuments();
    expect(docs).toHaveLength(1);
  });

  it('listDocuments returns recently-added-first order', async () => {
    const { store } = makeDeps();
    const a = new Uint8Array([1]);
    const b = new Uint8Array([2]);
    const c = new Uint8Array([3]);

    await store.importPdf(a, 'a.pdf');
    // small delay to ensure different importedAt values
    await new Promise<void>((r) => setTimeout(r, 2));
    await store.importPdf(b, 'b.pdf');
    await new Promise<void>((r) => setTimeout(r, 2));
    await store.importPdf(c, 'c.pdf');

    const docs = await store.listDocuments();
    expect(docs).toHaveLength(3);
    // most recently imported first
    expect(docs[0]!.filename).toBe('c.pdf');
    expect(docs[1]!.filename).toBe('b.pdf');
    expect(docs[2]!.filename).toBe('a.pdf');
  });

  it('deduped import does not add a second outbox entry (invariant #2)', async () => {
    const { store, repo } = makeDeps();
    const bytes = new Uint8Array([99, 88]);

    await store.importPdf(bytes, 'file.pdf');
    await store.importPdf(bytes, 'file.pdf');

    const docs = await store.listDocuments();
    expect(docs).toHaveLength(1);
    // Directly assert the outbox: exactly one entry was ever stamped (invariant #2).
    const unacked = await repo.unacked();
    expect(unacked).toHaveLength(1);
  });
});

// ── getPdfBytes tests ─────────────────────────────────────────────────────────

describe('getPdfBytes', () => {
  it('returns the stored bytes after import', async () => {
    const { store } = makeDeps();
    const bytes = new Uint8Array([10, 20, 30, 40, 50]);

    const result = await store.importPdf(bytes, 'book.pdf');
    expect(result.deduped).toBe(false);

    const docs = await store.listDocuments();
    expect(docs).toHaveLength(1);
    const doc = docs[0]!;

    const retrieved = await store.getPdfBytes(doc.id);
    expect(retrieved).toBeDefined();
    expect(retrieved).toEqual(bytes);
  });

  it('returns undefined for an unknown id', async () => {
    const { store } = makeDeps();

    const retrieved = await store.getPdfBytes('does-not-exist');
    expect(retrieved).toBeUndefined();
  });

  it('result is value-isolated — mutating it does not corrupt the store', async () => {
    const { store } = makeDeps();
    const original = new Uint8Array([1, 2, 3, 4, 5]);

    const result = await store.importPdf(original, 'isolated.pdf');
    const docs = await store.listDocuments();
    const doc = docs[0]!;

    const retrieved1 = await store.getPdfBytes(doc.id);
    expect(retrieved1).toBeDefined();

    // Mutate the retrieved copy — the store must still return the original content.
    retrieved1![0] = 0xff;
    retrieved1![1] = 0xff;

    const retrieved2 = await store.getPdfBytes(doc.id);
    expect(retrieved2).toBeDefined();
    expect(retrieved2![0]).toBe(original[0]);
    expect(retrieved2![1]).toBe(original[1]);

    // Suppress unused-variable warning
    void result;
  });
});
