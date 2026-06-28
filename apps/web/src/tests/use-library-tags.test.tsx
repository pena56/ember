/**
 * use-library-tags.test.tsx — hook behavior tests for useLibraryTags (Unit 15b).
 *
 * Covers:
 * - tagsByDoc drops orphan links (tag deleted → no chip)
 * - LibraryEntry[] built on canonical set (alias docs excluded)
 * - active-query filtering delegates to evaluateSmartView
 * - switching active view re-filters
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DUPLICATE_DECISIONS_COLLECTION, DOC_TAGS_COLLECTION, TAGS_COLLECTION } from '@ember/core';
import { MemoryBlobStore, MemoryRepository } from '@ember/store';

import { useLibraryTags } from '../library/use-library-tags.js';
import { StoreProvider } from '../store/store-context.js';
import { subtleCryptoHasher } from '../store/subtle-crypto-hasher.js';
import { createWebClock } from '../store/web-clock.js';
import { createWebStore } from '../store/web-store.js';
import type { WebStore } from '../store/web-store.js';

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

// Minimal document fixture
function makeDoc(id: string, importedAt = 1_000_000) {
  return {
    id,
    title: `Book ${id}`,
    filename: `${id}.pdf`,
    byteSize: 1000,
    importedAt,
    contentType: 'application/pdf',
  };
}

// Minimal tag fixture
function makeTagRecord(id: string, name: string, color = 'gray') {
  return { id, name, color, createdAt: 1_000_000, updatedAt: '0|0000000000000|0' };
}

// Minimal doc-tag link
function makeDocTagRecord(documentId: string, tagId: string) {
  return {
    id: `${documentId}:${tagId}`,
    documentId,
    tagId,
    createdAt: 1_000_000,
    updatedAt: '0|0000000000000|0',
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useLibraryTags', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('tagsByDoc drops orphan links (tag deleted, doc-tag link still exists)', async () => {
    const repo = new MemoryRepository();
    const store = makeMemoryStore(repo);

    // One doc, one doc-tag link pointing to a non-existent tag
    await repo.put('documents', makeDoc('doc-1'));
    await repo.put(DOC_TAGS_COLLECTION, makeDocTagRecord('doc-1', 'missing-tag'));

    const { result } = renderHook(() => useLibraryTags(), { wrapper: makeWrapper(store) });
    await act(async () => { await Promise.resolve(); });

    // tagsByDoc should have no entry for doc-1 (orphan link dropped)
    const tagsForDoc = result.current.tagsByDoc.get('doc-1');
    expect(tagsForDoc).toBeUndefined();
  });

  it('tagsByDoc includes live tags for linked docs', async () => {
    const repo = new MemoryRepository();
    const store = makeMemoryStore(repo);

    await repo.put('documents', makeDoc('doc-1'));
    await repo.put(TAGS_COLLECTION, makeTagRecord('tag-a', 'Fiction', 'blue'));
    await repo.put(DOC_TAGS_COLLECTION, makeDocTagRecord('doc-1', 'tag-a'));

    const { result } = renderHook(() => useLibraryTags(), { wrapper: makeWrapper(store) });
    await act(async () => { await Promise.resolve(); });

    const tagsForDoc = result.current.tagsByDoc.get('doc-1');
    expect(tagsForDoc).toBeDefined();
    expect(tagsForDoc!).toHaveLength(1);
    expect(tagsForDoc![0]!.name).toBe('Fiction');
  });

  it('LibraryEntry[] is built on canonical set — alias docs excluded', async () => {
    const repo = new MemoryRepository();
    const store = makeMemoryStore(repo);

    // Two docs, one is an alias
    await repo.put('documents', makeDoc('doc-canonical', 2_000_000));
    await repo.put('documents', makeDoc('doc-alias', 1_000_000));

    // doc-alias is merged into doc-canonical
    await repo.put(DUPLICATE_DECISIONS_COLLECTION, {
      id: 'doc-alias:doc-canonical',
      canonicalId: 'doc-canonical',
      aliasId: 'doc-alias',
      decision: 'merged',
      updatedAt: '0|0000000000000|0',
    });

    const { result } = renderHook(() => useLibraryTags(), { wrapper: makeWrapper(store) });
    await act(async () => { await Promise.resolve(); });

    // Only canonical doc should appear
    expect(result.current.documents).toHaveLength(1);
    expect(result.current.documents[0]!.id).toBe('doc-canonical');
  });

  it('active "All" view returns all canonical docs', async () => {
    const repo = new MemoryRepository();
    const store = makeMemoryStore(repo);

    await repo.put('documents', makeDoc('doc-1', 2_000_000));
    await repo.put('documents', makeDoc('doc-2', 1_000_000));

    const { result } = renderHook(() => useLibraryTags(), { wrapper: makeWrapper(store) });
    await act(async () => { await Promise.resolve(); });

    // Default view is "All" with empty query — all docs
    expect(result.current.documents).toHaveLength(2);
  });

  it('switching active view to "Untagged" filters to docs with zero tags', async () => {
    const repo = new MemoryRepository();
    const store = makeMemoryStore(repo);

    await repo.put('documents', makeDoc('doc-tagged', 2_000_000));
    await repo.put('documents', makeDoc('doc-untagged', 1_000_000));
    await repo.put(TAGS_COLLECTION, makeTagRecord('tag-a', 'Fiction'));
    await repo.put(DOC_TAGS_COLLECTION, makeDocTagRecord('doc-tagged', 'tag-a'));

    const { result } = renderHook(() => useLibraryTags(), { wrapper: makeWrapper(store) });
    await act(async () => { await Promise.resolve(); });

    // Switch to Untagged
    act(() => {
      result.current.setActiveView({
        kind: 'builtin',
        key: 'untagged',
        query: { untaggedOnly: true },
      });
    });

    expect(result.current.documents).toHaveLength(1);
    expect(result.current.documents[0]!.id).toBe('doc-untagged');
  });

  it('evaluateSmartView order is preserved (importedAt DESC, id ASC tiebreak)', async () => {
    const repo = new MemoryRepository();
    const store = makeMemoryStore(repo);

    // Same importedAt, different ids — expect id ASC
    const ts = 2_000_000;
    await repo.put('documents', makeDoc('doc-b', ts));
    await repo.put('documents', makeDoc('doc-a', ts));

    const { result } = renderHook(() => useLibraryTags(), { wrapper: makeWrapper(store) });
    await act(async () => { await Promise.resolve(); });

    const ids = result.current.documents.map((d) => d.id);
    expect(ids).toEqual(['doc-a', 'doc-b']); // id ASC tiebreak
  });

  it('switching active pill to tag filter re-filters documents', async () => {
    const repo = new MemoryRepository();
    const store = makeMemoryStore(repo);

    await repo.put('documents', makeDoc('doc-fiction', 2_000_000));
    await repo.put('documents', makeDoc('doc-other', 1_000_000));
    await repo.put(TAGS_COLLECTION, makeTagRecord('tag-fiction', 'Fiction'));
    await repo.put(DOC_TAGS_COLLECTION, makeDocTagRecord('doc-fiction', 'tag-fiction'));

    const { result } = renderHook(() => useLibraryTags(), { wrapper: makeWrapper(store) });
    await act(async () => { await Promise.resolve(); });

    expect(result.current.documents).toHaveLength(2); // All view

    // Switch to tag filter
    act(() => {
      result.current.setActiveView({
        kind: 'builtin',
        key: 'tag:tag-fiction',
        query: { tagIds: ['tag-fiction'], tagMatch: 'any' },
      });
    });

    expect(result.current.documents).toHaveLength(1);
    expect(result.current.documents[0]!.id).toBe('doc-fiction');
  });
});
