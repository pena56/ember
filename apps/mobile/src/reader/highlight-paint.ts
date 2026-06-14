/**
 * highlight-paint.ts — builds the `setAnnotations` bridge message for the WebView paint layer.
 *
 * Pure: no RN/DOM. Takes the flat annotation list and the per-page geometry map,
 * resolves each annotation's anchor → normalized boxes via `@ember/core`, and
 * packages the result into the message the WebView expects.
 *
 * Skips annotations whose page geometry is unknown — they will be re-emitted once
 * that page's geometry arrives via `onTextGeometry` (lazy virtualized render).
 */

import { resolveAnchorRects } from '@ember/core';
import type { Annotation, AnnotationKind, HighlightColor, NormalizedBox, PageTextGeometry } from '@ember/core';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PaintItem = {
  id: string;
  page: number;
  kind: AnnotationKind;
  color: HighlightColor | undefined;
  boxes: NormalizedBox[];
};

export type SetAnnotationsMessage = {
  type: 'setAnnotations';
  items: PaintItem[];
};

// ── buildSetAnnotationsMessage ─────────────────────────────────────────────────

/**
 * Build the `{ type:'setAnnotations', items }` message to post into the WebView.
 *
 * For each annotation:
 *   - Look up the page geometry in `geometryByPage`.
 *   - If absent: skip (geometry not yet received for that page — will re-post when it arrives).
 *   - If present: resolve `resolveAnchorRects(annotation.anchor, geometry)` → boxes.
 *
 * The WebView receives page-fraction normalized boxes and paints highlight overlays
 * without needing any core math (invariant: no `@ember/core` in the inlined HTML).
 */
export function buildSetAnnotationsMessage(
  annotations: Annotation[],
  geometryByPage: Map<number, PageTextGeometry>,
): SetAnnotationsMessage {
  const items: PaintItem[] = [];

  for (const annotation of annotations) {
    const page = annotation.anchor.page;
    const geometry = geometryByPage.get(page);

    // Skip annotations whose page geometry has not yet been received.
    if (geometry === undefined) continue;

    const boxes = resolveAnchorRects(annotation.anchor, geometry);

    items.push({
      id: annotation.id,
      page,
      kind: annotation.kind,
      color: annotation.color,
      boxes,
    });
  }

  return { type: 'setAnnotations', items };
}
