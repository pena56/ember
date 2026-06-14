/**
 * use-annotations.ts — load + create hook for document annotations.
 *
 * Loads annotations from the local store on mount/docId change.
 * Exposes annotationsByPage (grouped Map) for per-page rendering,
 * and createHighlight() for the selection toolbar.
 */

import { useCallback, useEffect, useState } from 'react';

import type { Annotation, HighlightColor, TextAnchor } from '@ember/core';

import { useWebStore } from '../store/store-context.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UseAnnotationsResult {
  /** All annotations for this doc, grouped by anchor.page for efficient per-page lookup. */
  annotationsByPage: Map<number, Annotation[]>;
  /** Create a new highlight annotation. Optimistic: appends to state after await. */
  createHighlight(input: { anchor: TextAnchor; color: HighlightColor }): Promise<void>;
  /**
   * Create a new standalone note annotation. The note must be non-empty (enforced by the
   * caller — 10a throws on empty note-kind text). Optimistic: appends to state after await.
   * Returns the persisted Annotation so the caller can immediately open its editor.
   */
  createNote(input: { anchor: TextAnchor; note: string }): Promise<Annotation>;
  /**
   * Edit an existing annotation (recolor / add/update/clear note). Replaces the annotation
   * in state by id after the store resolves (optimistic-after-await, no reload).
   */
  updateAnnotation(input: { annotation: Annotation; patch: { color?: HighlightColor; note?: string | null } }): Promise<void>;
  /**
   * Delete an annotation by id. Drops it from state without a full reload.
   */
  removeAnnotation(id: string): Promise<void>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAnnotations(docId: string): UseAnnotationsResult {
  const store = useWebStore();
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  // Load all annotations for this doc on mount + docId change.
  useEffect(() => {
    let cancelled = false;

    store.listAnnotations(docId).then((list) => {
      if (!cancelled) setAnnotations(list);
    }).catch(() => {
      // Load failure is non-fatal; reader still works, highlights just don't appear.
    });

    return () => { cancelled = true; };
  }, [store, docId]);

  // Group by page for O(1) per-page lookup in the render path.
  const annotationsByPage = new Map<number, Annotation[]>();
  for (const annotation of annotations) {
    const page = annotation.anchor.page;
    const bucket = annotationsByPage.get(page) ?? [];
    bucket.push(annotation);
    annotationsByPage.set(page, bucket);
  }

  const createHighlight = useCallback(
    async (input: { anchor: TextAnchor; color: HighlightColor }): Promise<void> => {
      const created = await store.createAnnotation({
        docId,
        kind: 'highlight',
        anchor: input.anchor,
        color: input.color,
      });
      // Optimistic: append without a full reload.
      setAnnotations((prev) => [...prev, created]);
    },
    [store, docId],
  );

  const createNote = useCallback(
    async (input: { anchor: TextAnchor; note: string }): Promise<Annotation> => {
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
      const updated = await store.updateAnnotation(input);
      // Replace by id in state (optimistic-after-await, no reload).
      setAnnotations((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    },
    [store],
  );

  const removeAnnotation = useCallback(
    async (id: string): Promise<void> => {
      await store.deleteAnnotation(id);
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
    },
    [store],
  );

  return { annotationsByPage, createHighlight, createNote, updateAnnotation, removeAnnotation };
}
