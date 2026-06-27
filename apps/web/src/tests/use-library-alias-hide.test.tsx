/**
 * use-library-alias-hide.test.tsx — verify that useLibrary drops alias documents
 * (docs whose resolveCanonicalId points to a different id) from the list.
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DUPLICATE_DECISIONS_COLLECTION } from '@ember/core';
import { MemoryBlobStore, MemoryRepository } from '@ember/store';

import { useLibrary } from '../library/use-library.js';
import { StoreProvider } from '../store/store-context.js';
import { subtleCryptoHasher } from '../store/subtle-crypto-hasher.js';
import { createWebClock } from '../store/web-clock.js';
import { createWebStore } from '../store/web-store.js';
import type { WebStore } from '../store/web-store.js';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  Toaster: () => null,
}));

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

describe('useLibrary alias-hide', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows both docs when no decisions exist', async () => {
    const repo = new MemoryRepository();
    const store = makeMemoryStore(repo);

    await repo.put('documents', {
      id: 'doc-a', title: 'Book A', filename: 'a.pdf',
      byteSize: 1000, importedAt: Date.now(), contentType: 'application/pdf',
    });
    await repo.put('documents', {
      id: 'doc-b', title: 'Book B', filename: 'b.pdf',
      byteSize: 2000, importedAt: Date.now(), contentType: 'application/pdf',
    });

    const { result } = renderHook(() => useLibrary(), { wrapper: makeWrapper(store) });
    await act(async () => { await Promise.resolve(); });

    expect(result.current.documents.map((d) => d.id).sort()).toEqual(['doc-a', 'doc-b']);
  });

  it('hides the alias doc when there is a merged decision', async () => {
    const repo = new MemoryRepository();
    const store = makeMemoryStore(repo);

    await repo.put('documents', {
      id: 'doc-a', title: 'Book', filename: 'a.pdf',
      byteSize: 1000, importedAt: Date.now(), contentType: 'application/pdf',
    });
    await repo.put('documents', {
      id: 'doc-b', title: 'Book', filename: 'b.pdf',
      byteSize: 1050, importedAt: Date.now(), contentType: 'application/pdf',
    });

    // doc-a is the alias of doc-b (canonical)
    await repo.put(DUPLICATE_DECISIONS_COLLECTION, {
      id: 'doc-a:doc-b',
      canonicalId: 'doc-b',
      aliasId: 'doc-a',
      decision: 'merged',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const { result } = renderHook(() => useLibrary(), { wrapper: makeWrapper(store) });
    await act(async () => { await Promise.resolve(); });

    // Only canonical doc-b should be visible
    const ids = result.current.documents.map((d) => d.id);
    expect(ids).not.toContain('doc-a');
    expect(ids).toContain('doc-b');
    expect(ids).toHaveLength(1);
  });

  it('shows both docs when decision is "separate" (not a merge)', async () => {
    const repo = new MemoryRepository();
    const store = makeMemoryStore(repo);

    await repo.put('documents', {
      id: 'doc-a', title: 'Same', filename: 'a.pdf',
      byteSize: 1000, importedAt: Date.now(), contentType: 'application/pdf',
    });
    await repo.put('documents', {
      id: 'doc-b', title: 'Same', filename: 'b.pdf',
      byteSize: 1050, importedAt: Date.now(), contentType: 'application/pdf',
    });

    await repo.put(DUPLICATE_DECISIONS_COLLECTION, {
      id: 'doc-a:doc-b',
      canonicalId: 'doc-a',
      aliasId: 'doc-b',
      decision: 'separate',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const { result } = renderHook(() => useLibrary(), { wrapper: makeWrapper(store) });
    await act(async () => { await Promise.resolve(); });

    const ids = result.current.documents.map((d) => d.id).sort();
    expect(ids).toEqual(['doc-a', 'doc-b']);
  });
});
