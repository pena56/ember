/**
 * reading-position.ts — pure scroll-geometry helpers for reading position capture/restore.
 *
 * No DOM access, no React — these functions are headlessly unit-tested in
 * reading-position.test.ts. The actual DOM reads happen in the caller (reader-page.tsx
 * and use-reading-position.ts).
 */

// ── Local helper ──────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Compute the within-page offset (0..1) for a scroll position.
 *
 * Both `pageTop` and `viewportTop` must be in the same coordinate space
 * (e.g. both viewport-relative or both document-relative).
 *
 * Returns 0 when pageHeight <= 0 (guard against divide-by-zero).
 */
export function computePageOffset(args: {
  pageTop: number;
  pageHeight: number;
  viewportTop: number;
}): number {
  const { pageTop, pageHeight, viewportTop } = args;
  if (pageHeight <= 0) return 0;
  return clamp((viewportTop - pageTop) / pageHeight, 0, 1);
}

/**
 * Compute the absolute scrollTop that lands the saved within-page offset at
 * the top of the scroll container's viewport.
 *
 * `pageOffsetTop` is the page wrapper's `offsetTop` within the scroll container.
 */
export function resumeScrollTop(args: {
  pageOffsetTop: number;
  pageHeight: number;
  offset: number;
}): number {
  const { pageOffsetTop, pageHeight, offset } = args;
  return pageOffsetTop + clamp(offset, 0, 1) * pageHeight;
}
