// Anchor resolver — pure char-range → normalized rect mapper.
// No platform APIs; consumes only the 05c PageTextGeometry types.
// Invariant: core imports no platform API (code-standards).

import type { TextAnchor } from './annotation.js';
import type { NormalizedBox, PageTextGeometry } from './text-geometry.js';

// ---------------------------------------------------------------------------
// buildPageText
// ---------------------------------------------------------------------------

/**
 * Canonical separator-free concatenation of all text items on a page.
 * Clients MUST derive `startChar`/`endChar`/`quote` against this exact string
 * so that resolution agrees by construction with `resolveAnchorRects`.
 *
 * Items are walked in `index` order (which matches array order for pdf.js output).
 * Empty spacing items (str === '') contribute zero characters — no separator is
 * inserted.
 */
export function buildPageText(geometry: PageTextGeometry): string {
  // Items from normalizePageText are already in index order (array index === .index).
  // We concatenate without any separator.
  return geometry.items.map((item) => item.str).join('');
}

// ---------------------------------------------------------------------------
// resolveAnchorRects
// ---------------------------------------------------------------------------

/**
 * Map a `[startChar, endChar)` char-range anchor to one normalized bounding box
 * per overlapped text item.
 *
 * - Multi-line selections yield multiple boxes (one per run/item).
 * - Full item coverage → emit the item's `box` unchanged.
 * - Partial coverage → horizontal sub-slice via uniform per-char advance:
 *     frac0 = (from - itemStart) / len
 *     frac1 = (to   - itemStart) / len
 *     x      = box.x + frac0 * box.width
 *     width  = (frac1 - frac0) * box.width
 *     y / height unchanged.
 *
 * Guards:
 * - Range is clamped to `[0, totalLen]` before processing.
 * - Returns `[]` when `startChar >= endChar` after clamp, or geometry is empty.
 * - Skips zero-length items (`str === ''`) and zero-width boxes.
 * - Never emits NaN or negative-width boxes.
 * - Pure: does not mutate `geometry`.
 */
export function resolveAnchorRects(
  anchor: TextAnchor,
  geometry: PageTextGeometry,
): NormalizedBox[] {
  const items = geometry.items;
  if (items.length === 0) return [];

  // Compute total text length for clamping.
  let totalLen = 0;
  for (const item of items) {
    totalLen += item.str.length;
  }

  // Clamp the range.
  const clampedStart = Math.max(0, Math.min(anchor.startChar, totalLen));
  const clampedEnd = Math.max(0, Math.min(anchor.endChar, totalLen));

  if (clampedStart >= clampedEnd) return [];

  const result: NormalizedBox[] = [];
  let itemStart = 0;

  for (const item of items) {
    const len = item.str.length;

    // Skip zero-length (spacing) items — they occupy 0 chars.
    if (len === 0) continue;

    const itemEnd = itemStart + len;

    // Check overlap with [clampedStart, clampedEnd)
    const from = Math.max(clampedStart, itemStart);
    const to = Math.min(clampedEnd, itemEnd);

    if (from < to) {
      // This item overlaps the selection.
      const box = item.box;

      // Skip zero-width boxes (no visual rect to emit).
      if (box.width === 0) {
        itemStart = itemEnd;
        continue;
      }

      let emitted: NormalizedBox;

      if (from === itemStart && to === itemEnd) {
        // Fully covered — emit unchanged.
        emitted = box;
      } else {
        // Partially covered — uniform-advance sub-slice.
        const frac0 = (from - itemStart) / len;
        const frac1 = (to - itemStart) / len;
        emitted = {
          x: box.x + frac0 * box.width,
          y: box.y,
          width: (frac1 - frac0) * box.width,
          height: box.height,
        };
      }

      result.push(emitted);
    }

    itemStart = itemEnd;

    // Early exit once we've passed the selection end.
    if (itemStart >= clampedEnd) break;
  }

  return result;
}
