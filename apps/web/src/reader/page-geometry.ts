/**
 * page-geometry.ts — web adapter: pdf.js TextContent → core PageTextGeometry.
 *
 * pdf.js is imported TYPE-ONLY so this adapter is unit-testable without a
 * pdf.js runtime/worker (the test passes raw JSON fixture objects instead).
 *
 * The actual normalizePageText math lives in @ember/core (05c-1); this file
 * is the thin platform projection: filter TextMarkedContent, project TextItem
 * fields to RawTextItem, then delegate to the pure core normalizer.
 */

import type { TextContent, TextItem } from 'pdfjs-dist/types/src/display/api';

import { normalizePageText, type PageTextGeometry, type RawTextItem } from '@ember/core';

// ── Type guard ────────────────────────────────────────────────────────────────

/**
 * Discriminate TextItem from TextMarkedContent.
 * TextMarkedContent carries { type, id? } but no `transform`/`str`.
 * TextItem always has a `transform` array.
 */
function isTextItem(it: TextContent['items'][number]): it is TextItem {
  return 'transform' in it;
}

// ── Internal projection ───────────────────────────────────────────────────────

function toRawTextItems(items: TextContent['items']): RawTextItem[] {
  return items.filter(isTextItem).map((it) => ({
    str: it.str,
    width: it.width,
    height: it.height,
    // pdf.js types transform as number[] but it is always length-6 in practice.
    transform: it.transform as [number, number, number, number, number, number],
  }));
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Convert a pdf.js page's text content into normalized page geometry.
 *
 * @param pageNumber - 1-based page number (passed through to PageTextGeometry).
 * @param viewport   - Scale-1 viewport (PDF points). Use page.getViewport({scale:1}).
 * @param textContent - The result of page.getTextContent(). Only `items` is read.
 *
 * Pure given its inputs. No DOM, no allocation beyond the map.
 * TextMarkedContent items (structure markers without text) are filtered out;
 * all TextItem entries (including empty-str/hasEOL spacing items) are preserved
 * in order for faithful char-offset reconstruction in unit 10.
 */
export function extractPageGeometry(
  pageNumber: number,
  viewport: { width: number; height: number },
  textContent: Pick<TextContent, 'items'>,
): PageTextGeometry {
  return normalizePageText(pageNumber, viewport, toRawTextItems(textContent.items));
}
