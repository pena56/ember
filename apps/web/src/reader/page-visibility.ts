/**
 * page-visibility.ts — pure helpers for scroll-mode page tracking.
 *
 * Kept here (no DOM deps) so they can be unit-tested without canvas/jsdom issues.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PageRect {
  pageNumber: number;
  top: number;
  bottom: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Given a list of page bounding rects and the current scroll viewport,
 * return the 1-based page number that is most visible (most overlap with viewport).
 * Falls back to page 1 if no overlap is found.
 */
export function mostVisiblePage(
  pages: PageRect[],
  viewportTop: number,
  viewportBottom: number,
): number {
  let bestPage = 1;
  let bestOverlap = -1;

  for (const page of pages) {
    const overlapTop = Math.max(page.top, viewportTop);
    const overlapBottom = Math.min(page.bottom, viewportBottom);
    const overlap = Math.max(0, overlapBottom - overlapTop);

    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestPage = page.pageNumber;
    }
  }

  return bestPage;
}

/**
 * Compute the placeholder height for a page given its natural aspect ratio
 * and the target display width.
 *
 * aspect = naturalHeight / naturalWidth  (e.g. A4 ≈ 1.414)
 */
export function placeholderHeight(naturalWidth: number, naturalHeight: number, displayWidth: number): number {
  if (naturalWidth <= 0) return displayWidth * 1.414; // A4 fallback
  return (naturalHeight / naturalWidth) * displayWidth;
}
