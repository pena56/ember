/**
 * annotation-anchor.ts — RN-side pure helpers for selection → TextAnchor mapping
 * and annotation → normalized boxes resolution.
 *
 * Pure: `@ember/core`-only, no RN/DOM — fully vitest-testable.
 *
 * Split of responsibilities vs. the WebView:
 *   - The WebView (vanilla JS, no imports) does the DOM TreeWalker walk and posts
 *     raw { page, startChar, endChar, rect } to RN.
 *   - RN (here) does the core-dependent `quote` derivation + anchor construction,
 *     and resolves anchor char-ranges → normalized page-fraction boxes for painting.
 *
 * This keeps `@ember/core` out of the inlined HTML string (invariant: no core/token
 * pipeline in the WebView — same constraint as the existing READER_PALETTE pattern).
 */

import { buildPageText, resolveAnchorRects } from '@ember/core';
import type { Annotation, NormalizedBox, PageTextGeometry, TextAnchor } from '@ember/core';

// ── anchorFromSelection ────────────────────────────────────────────────────────

/**
 * Convert a WebView-posted selection (raw char offsets, already DOM-walked) into a
 * TextAnchor with a `quote` field derived from `buildPageText().slice`.
 *
 * The WebView already did the DOM TreeWalker sum (same algorithm as web's
 * `charOffsetOf`); RN's only job here is the core-dependent quote derivation.
 *
 * - Order-normalizes reversed ranges.
 * - Returns null when `startChar === endChar` (collapsed / empty selection).
 */
export function anchorFromSelection(input: {
  page: number;
  startChar: number;
  endChar: number;
  geometry: PageTextGeometry;
}): TextAnchor | null {
  const { page, geometry } = input;

  // Order-normalize: the WebView may post reversed offsets on a right-to-left drag.
  let sc = input.startChar;
  let ec = input.endChar;
  if (sc > ec) {
    [sc, ec] = [ec, sc];
  }

  if (sc === ec) return null;

  // Derive quote from buildPageText — not from the DOM selection string, so it
  // always agrees with resolveAnchorRects (parity with web's selectionToTextAnchor).
  const quote = buildPageText(geometry).slice(sc, ec);

  return { kind: 'text', page, startChar: sc, endChar: ec, quote };
}

// ── boxesForAnnotation ────────────────────────────────────────────────────────

/**
 * Resolve an annotation's text anchor into normalized bounding boxes
 * (fractions of page dimensions) ready for the WebView paint layer.
 *
 * Thin wrapper over `resolveAnchorRects`. The boxes are already page-fraction
 * normalized — exactly the `{x, y, width, height}` values the WebView paints with.
 * Used to build the `setAnnotations.items[].boxes` array.
 */
export function boxesForAnnotation(
  annotation: Annotation,
  geometry: PageTextGeometry,
): NormalizedBox[] {
  return resolveAnchorRects(annotation.anchor, geometry);
}
