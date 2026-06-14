/**
 * use-annotations.ts — load + create hook for document annotations (mobile).
 *
 * Mirrors apps/web/src/reader/use-annotations.ts shape, minus update/remove
 * (those are 10e). Uses the NativeStore facade; guards on `store` being null
 * at first render (08c/09c precedent — store may not be ready immediately).
 *
 * - Loads annotations from the store on mount/docId change with a `cancelled` guard.
 * - Load failure is non-fatal: reader still works, highlights just don't appear.
 * - Exposes `annotations` (flat), `annotationsByPage` (grouped), `createHighlight`.
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

  return { annotations, annotationsByPage, createHighlight };
}
