/**
 * pdf-page.tsx — renders a single PDF page (canvas + optional text layer).
 *
 * When `active` the page is rendered to a <canvas> via pdf.js; in-flight
 * RenderTasks are cancelled on unmount / deps-change to prevent the
 * "canvas already in use" error. An absolutely-positioned text layer overlays
 * the canvas so text is selectable (unit 10 will add highlight anchors here).
 *
 * When NOT `active` a placeholder box is rendered at the correct aspect-ratio
 * height so the scroll container height stays stable.
 */

import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import { useEffect, useRef, useState } from 'react';

import type { PageTextGeometry } from '@ember/core';

import { extractPageGeometry } from './page-geometry.js';
import { placeholderHeight } from './page-visibility.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PdfPageProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  /** Display width in CSS pixels. The canvas is scaled for device pixel ratio. */
  displayWidth: number;
  /** When false render a same-size placeholder only (virtualization). */
  active: boolean;
  /**
   * Optional callback fired after getTextContent() resolves on every active render.
   * Receives the normalized page geometry (05c-2 seam for unit 10 highlight anchors).
   * No-op when unset. Geometry failure never breaks canvas/text-layer rendering.
   */
  onTextGeometry?: (geometry: PageTextGeometry) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PdfPage({ pdf, pageNumber, displayWidth, active, onTextGeometry }: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  // Natural page size for the placeholder box
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);

  // Probe natural size once (cheap — no render) so placeholders are sized correctly
  useEffect(() => {
    let cancelled = false;
    let pageHandle: PDFPageProxy | undefined;

    async function probe() {
      try {
        pageHandle = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const vp = pageHandle.getViewport({ scale: 1 });
        setNaturalSize({ w: vp.width, h: vp.height });
      } catch {
        // ignore — placeholder will use A4 fallback
      }
    }

    void probe();

    return () => {
      cancelled = true;
      pageHandle?.cleanup();
    };
  }, [pdf, pageNumber]);

  // Full render (canvas + text layer) when active
  useEffect(() => {
    if (!active) return;

    const canvas = canvasRef.current;
    const textDiv = textLayerRef.current;
    if (!canvas) return;

    let cancelled = false;
    let renderTask: ReturnType<PDFPageProxy['render']> | undefined;
    let textLayerHandle: TextLayer | undefined;
    let pageHandle: PDFPageProxy | undefined;

    async function render() {
      try {
        pageHandle = await pdf.getPage(pageNumber);
        if (cancelled) return;

        const devicePixelRatio = window.devicePixelRatio || 1;
        const scale = (displayWidth / pageHandle.getViewport({ scale: 1 }).width) * devicePixelRatio;
        const viewport = pageHandle.getViewport({ scale });

        // Size the canvas at physical pixels; CSS width = display width
        canvas!.width = viewport.width;
        canvas!.height = viewport.height;
        canvas!.style.width = `${displayWidth.toString()}px`;
        canvas!.style.height = `${(viewport.height / devicePixelRatio).toString()}px`;

        const ctx = canvas!.getContext('2d');
        if (!ctx || cancelled) return;

        // pdfjs-dist 6: `canvas` is the required param; `canvasContext` is optional (legacy)
        renderTask = pageHandle.render({ canvas: canvas!, viewport });
        await renderTask.promise;

        if (cancelled) return;

        // Text layer (skip if no textDiv available or page has no text)
        if (textDiv) {
          try {
            const textContent = await pageHandle.getTextContent();
            if (cancelled) return;

            // Fire geometry callback (runs even for text-empty pages so unit 10
            // can anchor against any page). Must be before the items.length guard.
            const vp1 = pageHandle.getViewport({ scale: 1 });
            onTextGeometry?.(
              extractPageGeometry(pageNumber, { width: vp1.width, height: vp1.height }, textContent),
            );

            if (textContent.items.length > 0) {
              // CSS render scale (display px per PDF unit) — independent of the
              // device-pixel-ratio used for the canvas. pdf.js sizes each glyph
              // as calc(var(--total-scale-factor) * --font-height), so this var
              // MUST be set on the container or text renders unscaled/misplaced.
              const cssScale =
                displayWidth / pageHandle.getViewport({ scale: 1 }).width;
              textDiv.style.setProperty('--total-scale-factor', cssScale.toString());

              textLayerHandle = new TextLayer({
                textContentSource: textContent,
                container: textDiv,
                viewport: pageHandle.getViewport({ scale: cssScale }),
              });
              await textLayerHandle.render();
            }
          } catch {
            // Text layer failure is non-fatal (scanned PDF, etc.)
          }
        }
      } catch (err) {
        // Render cancelled errors are expected on fast unmount; swallow silently.
        if (cancelled) return;
        throw err;
      }
    }

    void render();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayerHandle?.cancel();
      pageHandle?.cleanup();
    };
  }, [pdf, pageNumber, displayWidth, active, onTextGeometry]);

  const placeholderH = naturalSize
    ? placeholderHeight(naturalSize.w, naturalSize.h, displayWidth)
    : placeholderHeight(0, 0, displayWidth);

  if (!active) {
    return (
      <div
        aria-hidden="true"
        className="bg-reader-bg rounded shadow-sm border border-line"
        style={{ width: displayWidth, height: Math.round(placeholderH) }}
      />
    );
  }

  return (
    <div
      className="relative shadow-sm rounded overflow-hidden border border-line"
      style={{ width: displayWidth }}
    >
      <canvas ref={canvasRef} className="block" />
      {/* Text layer — transparent, selectable glyphs over the canvas.
          The `textLayer` class (styles.css) supplies pdf.js's structural
          positioning + transparent color; --total-scale-factor is set at
          render time. */}
      <div ref={textLayerRef} className="textLayer" />
    </div>
  );
}
