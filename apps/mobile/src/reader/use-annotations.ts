/**
 * use-annotations.ts — load + create/edit/delete hook for document annotations (mobile).
 *
 * Mirrors apps/web/src/reader/use-annotations.ts shape. Uses the NativeStore facade;
 * guards on `store` being null at first render (08c/09c precedent — store may not be
 * ready immediately).
 *
 * - Loads annotations from the store on mount/docId change with a `cancelled` guard.
 * - Load failure is non-fatal: reader still works, highlights just don't appear.
 * - Exposes `annotations` (flat), `annotationsByPage` (grouped), and the mutators
 *   `createHighlight`, `createNote`, `updateAnnotation`, `removeAnnotation`
 *   (all optimistic-after-await on the flat list by id; no full reload — 10e).
 */

import { useCallback, useEffect, useState } from 'react';

import type { Annotation, HighlightColor, TextAnchor } from '@ember/core';

import { useNativeStore } from '../store/store-context.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UseAnnotationsResult {
  /** All annotations for this doc, flat. */
  annotations: Annotation[];
  /** Annotations grouped by anchor.page for efficient per-page lookup. */
  annotationsByPage: Map<number, Annotation[]>;
  /**
   * Create a new highlight annotation. Optimistic: appends to local state after
   * the store resolves. Returns the persisted Annotation.
   * No-op (returns undefined) when the store is not yet ready.
   */
  createHighlight(input: { anchor: TextAnchor; color: HighlightColor }): Promise<Annotation | undefined>;
  /**
   * Create a new standalone note annotation. The note must be non-empty (enforced by
   * the caller — 10a throws on empty note-kind text). Optimistic: appends after await.
   * Returns the persisted Annotation so the caller can swap its draft editor to it.
   * No-op (returns undefined) when the store is not yet ready.
   */
  createNote(input: { anchor: TextAnchor; note: string }): Promise<Annotation | undefined>;
  /**
   * Edit an existing annotation (recolor / add/update/clear note). Replaces that id
   * in the flat state list after the store resolves (optimistic-after-await, no reload).
   */
  updateAnnotation(input: { annotation: Annotation; patch: { color?: HighlightColor; note?: string | null } }): Promise<void>;
  /**
   * Delete an annotation by id. Drops it from state without a full reload.
   */
  removeAnnotation(id: string): Promise<void>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAnnotations(docId: string): UseAnnotationsResult {
  const { store } = useNativeStore();
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  // Load all annotations for this doc on mount + docId/store change.
  useEffect(() => {
    if (!store) return;

    let cancelled = false;

    store.listAnnotations(docId).then((list) => {
      if (!cancelled) setAnnotations(list);
    }).catch(() => {
      // Load failure is non-fatal; reader still works, highlights just don't appear.
    });

    return () => { cancelled = true; };
  }, [store, docId]);

  // Group by anchor.page for O(1) per-page lookup in the render path.
  const annotationsByPage = new Map<number, Annotation[]>();
  for (const annotation of annotations) {
    const page = annotation.anchor.page;
    const bucket = annotationsByPage.get(page) ?? [];
    bucket.push(annotation);
    annotationsByPage.set(page, bucket);
  }

  const createHighlight = useCallback(
    async (input: { anchor: TextAnchor; color: HighlightColor }): Promise<Annotation | undefined> => {
      // Null-store guard — inert until the store is ready (08c/09c precedent).
      if (!store) return undefined;

      const created = await store.createAnnotation({
        docId,
        kind: 'highlight',
        anchor: input.anchor,
        color: input.color,
      });
      // Optimistic: append without a full reload.
      setAnnotations((prev) => [...prev, created]);
      return created;
    },
    [store, docId],
  );

  const createNote = useCallback(
    async (input: { anchor: TextAnchor; note: string }): Promise<Annotation | undefined> => {
      // Null-store guard — inert until the store is ready (08c/09c precedent).
      if (!store) return undefined;

      const created = await store.createAnnotation({
        docId,
        kind: 'note',
        anchor: input.anchor,
        note: input.note,
      });
      setAnnotations((prev) => [...prev, created]);
      return created;
    },
    [store, docId],
  );

  const updateAnnotation = useCallback(
    async (input: { annotation: Annotation; patch: { color?: HighlightColor; note?: string | null } }): Promise<void> => {
      if (!store) return;
      const updated = await store.updateAnnotation(input);
      // Replace by id in the flat list (optimistic-after-await, no reload).
      setAnnotations((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    },
    [store],
  );

  const removeAnnotation = useCallback(
    async (id: string): Promise<void> => {
      if (!store) return;
      await store.deleteAnnotation(id);
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
    },
    [store],
  );

  return { annotations, annotationsByPage, createHighlight, createNote, updateAnnotation, removeAnnotation };
}
