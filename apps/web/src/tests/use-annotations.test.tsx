/**
 * use-annotations.test.tsx — hook integration tests.
 *
 * Uses a stubbed WebStore (vi.fn()) to test that:
 * - useAnnotations loads existing annotations grouped by page on mount.
 * - createHighlight persists via store.createAnnotation and appends to annotationsByPage.
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Annotation, TextAnchor } from '@ember/core';

import { useAnnotations } from '../reader/use-annotations.js';
import { StoreProvider } from '../store/store-context.js';
import type { WebStore } from '../store/web-store.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ANCHOR: TextAnchor = { kind: 'text', page: 2, startChar: 0, endChar: 5, quote: 'Hello' };
const ANCHOR_P3: TextAnchor = { kind: 'text', page: 3, startChar: 0, endChar: 5, quote: 'World' };

function makeAnnotation(overrides?: Partial<Annotation>): Annotation {
  return {
    id: 'ann-1',
    docId: 'doc-x',
    kind: 'highlight',
    anchor: ANCHOR,
    color: 'yellow',
    createdAt: 1000,
    updatedAt: 'hlc-1',
    ...overrides,
  };
}

function makeStubStore(overrides?: Partial<WebStore>): WebStore {
  return {
    importPdf: vi.fn(),
    listDocuments: vi.fn().mockResolvedValue([]),
    getPdfBytes: vi.fn().mockResolvedValue(undefined),
    saveReadingPosition: vi.fn().mockResolvedValue({}),
    getReadingPosition: vi.fn().mockResolvedValue(undefined),
    listReadingPositions: vi.fn().mockResolvedValue([]),
    recordSession: vi.fn().mockResolvedValue({}),
    listSessions: vi.fn().mockResolvedValue([]),
    getGoalConfig: vi.fn().mockResolvedValue({}),
    setDocumentPageCount: vi.fn().mockResolvedValue(null),
    createAnnotation: vi.fn().mockResolvedValue(makeAnnotation()),
    listAnnotations: vi.fn().mockResolvedValue([]),
    updateAnnotation: vi.fn().mockResolvedValue(makeAnnotation()),
    deleteAnnotation: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as WebStore;
}

function makeWrapper(store: WebStore) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(StoreProvider, { store, children });
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useAnnotations', () => {
  it('loads existing annotations from the store on mount', async () => {
    const existingAnnotations: Annotation[] = [
      makeAnnotation({ id: 'a1', anchor: ANCHOR }),
      makeAnnotation({ id: 'a2', anchor: ANCHOR_P3 }),
    ];
    const store = makeStubStore({
      listAnnotations: vi.fn().mockResolvedValue(existingAnnotations),
    });

    const { result } = renderHook(() => useAnnotations('doc-x'), {
      wrapper: makeWrapper(store),
    });

    // Wait for the async load to complete.
    await act(async () => { await Promise.resolve(); });

    expect(result.current.annotationsByPage.get(2)).toHaveLength(1);
    expect(result.current.annotationsByPage.get(2)![0]!.id).toBe('a1');
    expect(result.current.annotationsByPage.get(3)).toHaveLength(1);
    expect(result.current.annotationsByPage.get(3)![0]!.id).toBe('a2');
  });

  it('starts with an empty annotationsByPage before the store resolves', () => {
    // Never-resolving listAnnotations to test initial state.
    const store = makeStubStore({
      listAnnotations: vi.fn().mockReturnValue(new Promise(() => {})),
    });

    const { result } = renderHook(() => useAnnotations('doc-x'), {
      wrapper: makeWrapper(store),
    });

    expect(result.current.annotationsByPage.size).toBe(0);
  });

  it('createHighlight calls store.createAnnotation and appends to annotationsByPage without reload', async () => {
    const newAnnotation = makeAnnotation({ id: 'new-ann', anchor: ANCHOR, color: 'pink' });
    const store = makeStubStore({
      listAnnotations: vi.fn().mockResolvedValue([]),
      createAnnotation: vi.fn().mockResolvedValue(newAnnotation),
    });

    const { result } = renderHook(() => useAnnotations('doc-x'), {
      wrapper: makeWrapper(store),
    });

    await act(async () => { await Promise.resolve(); });

    // Initially empty.
    expect(result.current.annotationsByPage.size).toBe(0);

    // Create a highlight.
    await act(async () => {
      await result.current.createHighlight({ anchor: ANCHOR, color: 'pink' });
    });

    // createAnnotation was called with the right input.
    expect(store.createAnnotation).toHaveBeenCalledOnce();
    expect(store.createAnnotation).toHaveBeenCalledWith({
      docId: 'doc-x',
      kind: 'highlight',
      anchor: ANCHOR,
      color: 'pink',
    });

    // listAnnotations was NOT called again (optimistic append, not full reload).
    expect(store.listAnnotations).toHaveBeenCalledOnce();

    // The new annotation appears in the map.
    expect(result.current.annotationsByPage.get(2)).toHaveLength(1);
    expect(result.current.annotationsByPage.get(2)![0]!.id).toBe('new-ann');
  });

  it('groups multiple annotations on the same page', async () => {
    const ann1 = makeAnnotation({ id: 'a1', anchor: ANCHOR });
    const ann2 = makeAnnotation({ id: 'a2', anchor: ANCHOR, color: 'blue' });
    const store = makeStubStore({
      listAnnotations: vi.fn().mockResolvedValue([ann1, ann2]),
    });

    const { result } = renderHook(() => useAnnotations('doc-x'), {
      wrapper: makeWrapper(store),
    });

    await act(async () => { await Promise.resolve(); });

    const page2 = result.current.annotationsByPage.get(2);
    expect(page2).toHaveLength(2);
  });

  it('reloads when docId changes', async () => {
    const store = makeStubStore({
      listAnnotations: vi.fn().mockResolvedValue([]),
    });

    let docId = 'doc-a';
    const { rerender } = renderHook(() => useAnnotations(docId), {
      wrapper: makeWrapper(store),
    });

    await act(async () => { await Promise.resolve(); });
    expect(store.listAnnotations).toHaveBeenCalledWith('doc-a');

    docId = 'doc-b';
    rerender();
    await act(async () => { await Promise.resolve(); });
    expect(store.listAnnotations).toHaveBeenCalledWith('doc-b');
  });

  // ── 10c: createNote, updateAnnotation, removeAnnotation ──────────────────────

  it('createNote persists a kind:"note" record and appends to annotationsByPage', async () => {
    const noteAnnotation = makeAnnotation({
      id: 'note-ann',
      kind: 'note',
      anchor: ANCHOR,
      note: 'My note',
    });
    const store = makeStubStore({
      listAnnotations: vi.fn().mockResolvedValue([]),
      createAnnotation: vi.fn().mockResolvedValue(noteAnnotation),
    });

    const { result } = renderHook(() => useAnnotations('doc-x'), {
      wrapper: makeWrapper(store),
    });

    await act(async () => { await Promise.resolve(); });
    expect(result.current.annotationsByPage.size).toBe(0);

    let created: Annotation | undefined;
    await act(async () => {
      created = await result.current.createNote({ anchor: ANCHOR, note: 'My note' });
    });

    // createAnnotation called with kind:'note'
    expect(store.createAnnotation).toHaveBeenCalledWith({
      docId: 'doc-x',
      kind: 'note',
      anchor: ANCHOR,
      note: 'My note',
    });

    // Returns the new annotation
    expect(created?.id).toBe('note-ann');
    expect(created?.kind).toBe('note');

    // Optimistically appended
    expect(result.current.annotationsByPage.get(2)).toHaveLength(1);
    expect(result.current.annotationsByPage.get(2)![0]!.kind).toBe('note');
  });

  it('updateAnnotation replaces in place (recolor) without reload', async () => {
    const existing = makeAnnotation({ id: 'ann-1', color: 'yellow', anchor: ANCHOR });
    const updated = makeAnnotation({ id: 'ann-1', color: 'blue', anchor: ANCHOR, updatedAt: 'hlc-2' });

    const store = makeStubStore({
      listAnnotations: vi.fn().mockResolvedValue([existing]),
      updateAnnotation: vi.fn().mockResolvedValue(updated),
    });

    const { result } = renderHook(() => useAnnotations('doc-x'), {
      wrapper: makeWrapper(store),
    });

    await act(async () => { await Promise.resolve(); });

    // Initially yellow
    expect(result.current.annotationsByPage.get(2)![0]!.color).toBe('yellow');

    await act(async () => {
      await result.current.updateAnnotation({ annotation: existing, patch: { color: 'blue' } });
    });

    expect(store.updateAnnotation).toHaveBeenCalledOnce();
    // No extra listAnnotations call
    expect(store.listAnnotations).toHaveBeenCalledOnce();

    // Now shows blue
    expect(result.current.annotationsByPage.get(2)![0]!.color).toBe('blue');
    expect(result.current.annotationsByPage.get(2)![0]!.updatedAt).toBe('hlc-2');
  });

  it('updateAnnotation replaces in place (note edit) without reload', async () => {
    const existing = makeAnnotation({ id: 'ann-1', anchor: ANCHOR });
    const withNote = { ...existing, note: 'Added note', updatedAt: 'hlc-3' };

    const store = makeStubStore({
      listAnnotations: vi.fn().mockResolvedValue([existing]),
      updateAnnotation: vi.fn().mockResolvedValue(withNote),
    });

    const { result } = renderHook(() => useAnnotations('doc-x'), {
      wrapper: makeWrapper(store),
    });

    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      await result.current.updateAnnotation({ annotation: existing, patch: { note: 'Added note' } });
    });

    const page2 = result.current.annotationsByPage.get(2)!;
    expect(page2[0]!.note).toBe('Added note');
  });

  it('removeAnnotation drops the annotation from state without reload', async () => {
    const existing = makeAnnotation({ id: 'ann-1', anchor: ANCHOR });
    const store = makeStubStore({
      listAnnotations: vi.fn().mockResolvedValue([existing]),
      deleteAnnotation: vi.fn().mockResolvedValue(undefined),
    });

    const { result } = renderHook(() => useAnnotations('doc-x'), {
      wrapper: makeWrapper(store),
    });

    await act(async () => { await Promise.resolve(); });

    expect(result.current.annotationsByPage.get(2)).toHaveLength(1);

    await act(async () => {
      await result.current.removeAnnotation('ann-1');
    });

    expect(store.deleteAnnotation).toHaveBeenCalledWith('ann-1');
    expect(store.listAnnotations).toHaveBeenCalledOnce(); // No reload

    // Annotation gone
    expect(result.current.annotationsByPage.get(2) ?? []).toHaveLength(0);
  });
});
