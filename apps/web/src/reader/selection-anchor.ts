/**
 * selection-anchor.ts — DOM Range → TextAnchor mapping.
 *
 * Pure DOM/math helper: no React, no pdf.js runtime.
 * The key insight: pdf.js TextLayer renders one <span> per non-empty text item,
 * in items order, with span.textContent === item.str. Because buildPageText
 * concatenates all items' str with no separator, the in-order concatenation of
 * text-layer text nodes equals buildPageText(geometry). So a DOM position maps
 * to a buildPageText char offset by summing the lengths of all preceding text
 * nodes plus the in-node offset.
 *
 * Fully jsdom-testable (no pdf.js runtime — tests build the span DOM by hand).
 */

import { buildPageText } from '@ember/core';
import type { NormalizedBox, PageTextGeometry, TextAnchor } from '@ember/core';

// ── charOffsetOf ──────────────────────────────────────────────────────────────

/**
 * Map a DOM (node, offsetInNode) pair to a char offset within `root`'s text.
 *
 * Walks text nodes under `root` in document order (TreeWalker, SHOW_TEXT).
 * Accumulates lengths; when the walker reaches `node`, returns
 * `accumulated + offsetInNode`. Returns `null` when `node` is not a text node
 * within `root`.
 */
export function charOffsetOf(
  root: HTMLElement,
  node: Node,
  offsetInNode: number,
): number | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let accumulated = 0;

  let current: Node | null = walker.nextNode();
  while (current !== null) {
    if (current === node) {
      return accumulated + offsetInNode;
    }
    accumulated += (current as Text).length;
    current = walker.nextNode();
  }

  return null;
}

// ── selectionToTextAnchor ─────────────────────────────────────────────────────

/**
 * Convert a DOM Range inside a pdf.js text layer into a TextAnchor.
 *
 * - Collapsed range → null.
 * - If start is outside root → null.
 * - If end is outside root (cross-page drag), clip endChar to page text length.
 * - Order-normalizes reversed ranges.
 * - If startChar === endChar after all adjustments → null.
 * - quote is derived from buildPageText().slice(), not the DOM selection string,
 *   so it always agrees with resolveAnchorRects regardless of DOM whitespace quirks.
 */
export function selectionToTextAnchor(args: {
  root: HTMLElement;
  page: number;
  range: Range;
  geometry: PageTextGeometry;
}): TextAnchor | null {
  const { root, page, range, geometry } = args;

  if (range.collapsed) return null;

  const startChar = charOffsetOf(root, range.startContainer, range.startOffset);
  if (startChar === null) return null;

  let endChar = charOffsetOf(root, range.endContainer, range.endOffset);
  // Cross-page drag: end is outside this page's root — clip to page text length.
  if (endChar === null) {
    endChar = buildPageText(geometry).length;
  }

  // Order-normalize reversed ranges (e.g. selection made right-to-left).
  let sc = startChar;
  let ec = endChar;
  if (sc > ec) {
    [sc, ec] = [ec, sc];
  }

  if (sc === ec) return null;

  const quote = buildPageText(geometry).slice(sc, ec);

  return { kind: 'text', page, startChar: sc, endChar: ec, quote };
}

// ── cssRectFromBox ────────────────────────────────────────────────────────────

/**
 * Scale a NormalizedBox (fractions of page dimensions) to CSS pixel coordinates.
 * Pure: the inverse-scaling companion to resolveAnchorRects.
 */
export function cssRectFromBox(
  box: NormalizedBox,
  pageWidthPx: number,
  pageHeightPx: number,
): { left: number; top: number; width: number; height: number } {
  return {
    left: box.x * pageWidthPx,
    top: box.y * pageHeightPx,
    width: box.width * pageWidthPx,
    height: box.height * pageHeightPx,
  };
}
