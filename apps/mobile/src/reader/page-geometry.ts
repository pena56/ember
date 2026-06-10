/**
 * page-geometry.ts — mobile RN adapter: bridge geometry message → core PageTextGeometry.
 *
 * Consumes untyped bridged JSON from the WebView (which posts raw pdf.js TextContent
 * fields: { pageNumber, viewport, items }). Validates and filters as it projects:
 * - Drops TextMarkedContent markers (items without `transform`).
 * - Keeps every TextItem in order (incl. empty-str/hasEOL spacing items).
 * - Delegates normalisation to @ember/core's normalizePageText (the same pure
 *   function used by apps/web), guaranteeing byte-for-byte parity by construction.
 *
 * No pdf.js import; no DOM. Pure + headlessly testable.
 */

import { normalizePageText, type PageTextGeometry, type RawTextItem } from '@ember/core';

// ── Bridge payload type ───────────────────────────────────────────────────────

/**
 * Shape of the { type:'geometry', ... } message posted by the WebView.
 * `items` is typed as unknown[] because we receive untyped JSON over the bridge.
 */
export type RawGeometryMessage = {
  pageNumber: number;
  viewport: { width: number; height: number };
  items: unknown[];
};

// ── Type guard ────────────────────────────────────────────────────────────────

/**
 * Discriminate a real TextItem from a TextMarkedContent marker.
 * A real text run always has a `transform` array; a marker ({type, id?}) does not.
 */
function isRawTextItem(
  it: unknown,
): it is { str: string; width: number; height: number; transform: number[] } {
  return (
    it !== null &&
    typeof it === 'object' &&
    'transform' in it
  );
}

// ── Internal projection ───────────────────────────────────────────────────────

function toRawTextItems(items: unknown[]): RawTextItem[] {
  const result: RawTextItem[] = [];
  for (const it of items) {
    if (!isRawTextItem(it)) continue; // drop TextMarkedContent markers
    result.push({
      str: typeof it.str === 'string' ? it.str : '',
      width: typeof it.width === 'number' ? it.width : 0,
      height: typeof it.height === 'number' ? it.height : 0,
      transform: it.transform as [number, number, number, number, number, number],
    });
  }
  return result;
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Convert a raw WebView bridge geometry message into normalised page geometry.
 *
 * Pure given its input. Mirrors the web adapter's `extractPageGeometry` but
 * consumes the parsed bridge message rather than a live pdf.js TextContent.
 * TextMarkedContent markers are dropped; all TextItem entries (incl. empty/hasEOL)
 * are preserved in reading order.
 */
export function geometryFromBridge(msg: RawGeometryMessage): PageTextGeometry {
  return normalizePageText(msg.pageNumber, msg.viewport, toRawTextItems(msg.items));
}
