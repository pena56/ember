/**
 * use-library-sync.test.tsx — use-library blob-status join.
 *
 * Tests:
 *  (1) doc with 'synced' status → syncState = 'synced'
 *  (2) doc with deferred + over-file-cap → syncState = 'over-file-cap'
 *  (3) doc with deferred + over-quota → syncState = 'over-quota'
 *  (4) doc with no status → syncState = 'pending'
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BLOB_SYNC_COLLECTION } from '@ember/core';
import { MemoryBlobStore, MemoryRepository } from '@ember/store';

import { useLibrary } from '../library/use-library.js';
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

describe('useLibrary blob-status join', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('(1) doc with synced status → syncState = "synced"', async () => {
    const repo = new MemoryRepository();
    const store = makeMemoryStore(repo);

    // Insert a document record
    await repo.put('documents', {
      id: 'doc-1', title: 'Test', filename: 'test.pdf',
      contentId: 'doc-1', byteSize: 100, importedAt: Date.now(),
    });
    // Insert synced status
    await repo.put(BLOB_SYNC_COLLECTION, { id: 'doc-1', status: 'synced' });

    const { result } = renderHook(() => useLibrary(), { wrapper: makeWrapper(store) });

    await act(async () => { await Promise.resolve(); });

    const doc = result.current.documents.find((d) => d.id === 'doc-1');
    expect(doc?.syncState).toBe('synced');
  });

  it('(2) doc with deferred over-file-cap → syncState = "over-file-cap"', async () => {
    const repo = new MemoryRepository();
    const store = makeMemoryStore(repo);

    await repo.put('documents', {
      id: 'doc-2', title: 'Big', filename: 'big.pdf',
      contentId: 'doc-2', byteSize: 60_000_000, importedAt: Date.now(),
    });
    await repo.put(BLOB_SYNC_COLLECTION, { id: 'doc-2', status: 'deferred', code: 'over-file-cap' });

    const { result } = renderHook(() => useLibrary(), { wrapper: makeWrapper(store) });
    await act(async () => { await Promise.resolve(); });

    const doc = result.current.documents.find((d) => d.id === 'doc-2');
    expect(doc?.syncState).toBe('over-file-cap');
  });

  it('(3) doc with deferred over-quota → syncState = "over-quota"', async () => {
    const repo = new MemoryRepository();
    const store = makeMemoryStore(repo);

    await repo.put('documents', {
      id: 'doc-3', title: 'Quota', filename: 'quota.pdf',
      contentId: 'doc-3', byteSize: 5_000_000, importedAt: Date.now(),
    });
    await repo.put(BLOB_SYNC_COLLECTION, { id: 'doc-3', status: 'deferred', code: 'over-quota' });

    const { result } = renderHook(() => useLibrary(), { wrapper: makeWrapper(store) });
    await act(async () => { await Promise.resolve(); });

    const doc = result.current.documents.find((d) => d.id === 'doc-3');
    expect(doc?.syncState).toBe('over-quota');
  });

  it('(4) doc with no status → syncState = "pending"', async () => {
    const repo = new MemoryRepository();
    const store = makeMemoryStore(repo);

    await repo.put('documents', {
      id: 'doc-4', title: 'New', filename: 'new.pdf',
      contentId: 'doc-4', byteSize: 1000, importedAt: Date.now(),
    });
    // No status record inserted

    const { result } = renderHook(() => useLibrary(), { wrapper: makeWrapper(store) });
    await act(async () => { await Promise.resolve(); });

    const doc = result.current.documents.find((d) => d.id === 'doc-4');
    expect(doc?.syncState).toBe('pending');
  });
});
