/**
 * use-duplicates.test.tsx — hook tests for undecided-pair surfacing,
 * session dismiss, merge, keepSeparate, and refresh.
 */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Document } from '@ember/core';
import { DUPLICATE_DECISIONS_COLLECTION } from '@ember/core';
import { MemoryBlobStore, MemoryRepository } from '@ember/store';

import { useDuplicates } from '../library/use-duplicates.js';
import { StoreProvider } from '../store/store-context.js';
import { subtleCryptoHasher } from '../store/subtle-crypto-hasher.js';
import { createWebClock } from '../store/web-clock.js';
import { createWebStore } from '../store/web-store.js';
import type { WebStore } from '../store/web-store.js';

// Mock sonner to avoid issues
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  Toaster: () => null,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStorage(): { getItem(k: string): string | null; setItem(k: string, v: string): void } {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => { store.set(k, v); },
  };
}

function makeMemoryStore(repo: MemoryRepository): WebStore {
  let counter = 0;
  return createWebStore({
    repo,
    blobs: new MemoryBlobStore(),
    hasher: subtleCryptoHasher,
    clock: createWebClock({
      storage: makeStorage(),
      now: () => Date.now(),
      newId: () => `test-id-${(++counter).toString()}`,
    }),
  });
}

function makeWrapper(store: WebStore) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <StoreProvider store={store}>{children}</StoreProvider>;
  };
}

/** Insert two near-duplicate documents directly into repo */
async function insertDuplicateDocs(repo: MemoryRepository): Promise<[Document, Document]> {
  const docA: Document = {
    id: 'doc-a',
    title: 'My Great Book',
    filename: 'my-great-book-v1.pdf',
    byteSize: 1_000_000,
    importedAt: Date.now() - 2000,
    contentType: 'application/pdf',
  };
  const docB: Document = {
    id: 'doc-b',
    title: 'My Great Book',
    filename: 'my-great-book-v2.pdf',
    byteSize: 1_050_000, // within 15% band
    importedAt: Date.now() - 1000,
    contentType: 'application/pdf',
  };
  await repo.put('documents', docA);
  await repo.put('documents', docB);
  return [docA, docB];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useDuplicates', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('returns empty pending + undefined current when no documents', async () => {
    const repo = new MemoryRepository();
    const store = makeMemoryStore(repo);

    const { result } = renderHook(() => useDuplicates(), { wrapper: makeWrapper(store) });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.pending).toHaveLength(0);
    expect(result.current.current).toBeUndefined();
  });

  it('surfaces an undecided pair as current', async () => {
    const repo = new MemoryRepository();
    const store = makeMemoryStore(repo);
    await insertDuplicateDocs(repo);

    const { result } = renderHook(() => useDuplicates(), { wrapper: makeWrapper(store) });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.current).toBeDefined();
    expect(result.current.current!.aId).toBe('doc-a');
    expect(result.current.current!.bId).toBe('doc-b');
    expect(result.current.currentDocs).toBeDefined();
    expect(result.current.currentDocs!.a.id).toBe('doc-a');
    expect(result.current.currentDocs!.b.id).toBe('doc-b');
  });

  it('default canonical is the doc with the larger byteSize', async () => {
    const repo = new MemoryRepository();
    const store = makeMemoryStore(repo);
    await insertDuplicateDocs(repo); // docB has byteSize 1_050_000 (larger)

    const { result } = renderHook(() => useDuplicates(), { wrapper: makeWrapper(store) });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // docB is larger
    expect(result.current.defaultCanonicalId).toBe('doc-b');
  });

  it('does not surface pair already decided as merged', async () => {
    const repo = new MemoryRepository();
    const store = makeMemoryStore(repo);
    await insertDuplicateDocs(repo);

    // Pre-seed a merged decision
    await repo.put(DUPLICATE_DECISIONS_COLLECTION, {
      id: 'doc-a:doc-b',
      canonicalId: 'doc-b',
      aliasId: 'doc-a',
      decision: 'merged',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const { result } = renderHook(() => useDuplicates(), { wrapper: makeWrapper(store) });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.current).toBeUndefined();
    expect(result.current.pending).toHaveLength(0);
  });

  it('does not surface pair already decided as separate', async () => {
    const repo = new MemoryRepository();
    const store = makeMemoryStore(repo);
    await insertDuplicateDocs(repo);

    // Pre-seed a separate decision
    await repo.put(DUPLICATE_DECISIONS_COLLECTION, {
      id: 'doc-a:doc-b',
      canonicalId: 'doc-a',
      aliasId: 'doc-b',
      decision: 'separate',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const { result } = renderHook(() => useDuplicates(), { wrapper: makeWrapper(store) });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.current).toBeUndefined();
  });

  it('dismiss removes pair from current for this session (no record written)', async () => {
    const repo = new MemoryRepository();
    const store = makeMemoryStore(repo);
    await insertDuplicateDocs(repo);

    const { result } = renderHook(() => useDuplicates(), { wrapper: makeWrapper(store) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.current).toBeDefined();

    await act(async () => {
      result.current.dismiss(result.current.current!);
    });

    // After dismiss, current is gone
    expect(result.current.current).toBeUndefined();

    // No decision record written
    const decisions = await repo.query(DUPLICATE_DECISIONS_COLLECTION);
    expect(decisions).toHaveLength(0);
  });

  it('merge calls saveDuplicateDecision and refreshes (pair disappears)', async () => {
    const repo = new MemoryRepository();
    const store = makeMemoryStore(repo);
    await insertDuplicateDocs(repo);

    const { result } = renderHook(() => useDuplicates(), { wrapper: makeWrapper(store) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    const pair = result.current.current!;

    await act(async () => {
      await result.current.merge(pair, 'doc-b');
    });

    await waitFor(() => expect(result.current.current).toBeUndefined());

    const decisions = await repo.query(DUPLICATE_DECISIONS_COLLECTION);
    expect(decisions).toHaveLength(1);
    expect((decisions[0] as unknown as { decision: string }).decision).toBe('merged');
  });

  it('keepSeparate calls saveDuplicateDecision with separate and refreshes', async () => {
    const repo = new MemoryRepository();
    const store = makeMemoryStore(repo);
    await insertDuplicateDocs(repo);

    const { result } = renderHook(() => useDuplicates(), { wrapper: makeWrapper(store) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    const pair = result.current.current!;

    await act(async () => {
      await result.current.keepSeparate(pair);
    });

    await waitFor(() => expect(result.current.current).toBeUndefined());

    const decisions = await repo.query(DUPLICATE_DECISIONS_COLLECTION);
    expect(decisions).toHaveLength(1);
    expect((decisions[0] as unknown as { decision: string }).decision).toBe('separate');
  });

  it('queues multiple pairs: shows one at a time', async () => {
    const repo = new MemoryRepository();
    const store = makeMemoryStore(repo);

    // Three near-duplicate docs — creates pairs: (a,b), (a,c), (b,c)
    const docA: Document = { id: 'doc-a', title: 'Shared Title', filename: 'a.pdf', byteSize: 1_000_000, importedAt: Date.now() - 3000, contentType: 'application/pdf' };
    const docB: Document = { id: 'doc-b', title: 'Shared Title', filename: 'b.pdf', byteSize: 1_010_000, importedAt: Date.now() - 2000, contentType: 'application/pdf' };
    const docC: Document = { id: 'doc-c', title: 'Shared Title', filename: 'c.pdf', byteSize: 1_020_000, importedAt: Date.now() - 1000, contentType: 'application/pdf' };
    await repo.put('documents', docA);
    await repo.put('documents', docB);
    await repo.put('documents', docC);

    const { result } = renderHook(() => useDuplicates(), { wrapper: makeWrapper(store) });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // There are multiple pending pairs but only one is current
    expect(result.current.current).toBeDefined();
    expect(result.current.pending.length).toBeGreaterThan(1);
  });
});
