/**
 * use-cover.ts — render a PDF's first page to a cached cover thumbnail.
 *
 * The thumbnail is generated client-side from the stored bytes (no cover field
 * on the Document; no server round-trip). Rendering is guarded on canvas 2D
 * availability, so environments without canvas (jsdom / tests) short-circuit and
 * callers fall back to the styled placeholder — pdf.js is never even imported in
 * that case (the dynamic import sits behind the guard).
 *
 * Results are memoised in a module-level cache keyed by docId, so toggling
 * list ⇄ grid or re-rendering never re-rasterises a page. The hook reads that
 * cache during render and only forces a re-render when an async raster resolves
 * (never a synchronous setState inside the effect body).
 */

import { useEffect, useState } from 'react';

import { useWebStore } from '../store/store-context.js';

/** Longest edge of the rendered thumbnail, in device px. Enough for a crisp card. */
const TARGET_WIDTH = 320;

/** Sentinel stored in the cache when rendering was attempted and failed. */
const FAILED = Symbol('cover-failed');

const cache = new Map<string, string | typeof FAILED>();

function canRasterise(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const probe = document.createElement('canvas');
    return probe.getContext('2d') !== null;
  } catch {
    return false;
  }
}

export function useCover(docId: string, contentType: string): string | undefined {
  const store = useWebStore();
  // Bumped only when an async raster settles, to re-read the cache below.
  const [, bump] = useState(0);

  useEffect(() => {
    if (cache.has(docId)) return; // already resolved or failed
    if (contentType !== 'application/pdf' || !canRasterise()) {
      cache.set(docId, FAILED);
      return;
    }

    let cancelled = false;
    const settle = (value: string | typeof FAILED) => {
      cache.set(docId, value);
      if (!cancelled) bump((n) => n + 1);
    };

    void (async () => {
      try {
        const bytes = await store.getPdfBytes(docId);
        if (cancelled) return;
        if (!bytes) {
          settle(FAILED);
          return;
        }

        // Dynamic import keeps pdf.js (and its worker asset) out of the module
        // graph for callers that never rasterise — including the test env.
        const { loadPdf } = await import('../reader/pdf.js');
        const pdf = await loadPdf(bytes);
        try {
          const page = await pdf.getPage(1);
          const base = page.getViewport({ scale: 1 });
          const scale = TARGET_WIDTH / base.width;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);

          // pdfjs-dist 6: `canvas` is the required param (canvasContext is legacy).
          await page.render({ canvas, viewport }).promise;
          if (cancelled) return;

          settle(canvas.toDataURL('image/jpeg', 0.82));
        } finally {
          void pdf.cleanup();
        }
      } catch {
        settle(FAILED);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [docId, contentType, store]);

  const hit = cache.get(docId);
  return typeof hit === 'string' ? hit : undefined;
}
