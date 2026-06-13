/**
 * highlight-layer.tsx — paints saved highlights on a PDF page.
 *
 * Renders between the canvas and the text layer so selection still works on top.
 * All highlight colors come from --color-highlight-* tokens (invariant #6).
 */

import type { CSSProperties } from 'react';

import { resolveAnchorRects } from '@ember/core';
import type { Annotation, HighlightColor, PageTextGeometry } from '@ember/core';

import { cssRectFromBox } from './selection-anchor.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface HighlightLayerProps {
  /** Annotations already filtered to this page number. */
  annotations: Annotation[];
  /** Normalized page geometry for this page (from extractPageGeometry). */
  geometry: PageTextGeometry | undefined;
  /** Rendered page width in CSS pixels. */
  pageWidth: number;
  /** Rendered page height in CSS pixels. */
  pageHeight: number;
}

// ── Color class map ───────────────────────────────────────────────────────────

// Maps the HighlightColor union → Tailwind utility class.
// bg-highlight-{color}/50 gives a 50% alpha tint over the single-sourced hue token.
// The composite blend is theme-driven via the --highlight-blend token (multiply on
// paper/sepia so ink reads through; screen on night so the tint lightens and stays
// legible against the dark page) — only the blend varies, never the palette (invariant #6).
const COLOR_CLASS: Record<HighlightColor, string> = {
  yellow: 'bg-highlight-yellow/50',
  green:  'bg-highlight-green/50',
  blue:   'bg-highlight-blue/50',
  pink:   'bg-highlight-pink/50',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function HighlightLayer({
  annotations,
  geometry,
  pageWidth,
  pageHeight,
}: HighlightLayerProps) {
  if (geometry === undefined) return null;

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
    >
      {annotations
        .filter((a) => a.kind === 'highlight')
        .flatMap((annotation) => {
          const boxes = resolveAnchorRects(annotation.anchor, geometry);
          return boxes.map((box, i) => {
            const rect = cssRectFromBox(box, pageWidth, pageHeight);
            const colorClass = COLOR_CLASS[annotation.color ?? 'yellow'];
            return (
              <div
                key={`${annotation.id}-${i.toString()}`}
                className={`absolute rounded-sm ${colorClass}`}
                style={{
                  left: rect.left,
                  top: rect.top,
                  width: rect.width,
                  height: rect.height,
                  mixBlendMode: 'var(--highlight-blend, multiply)' as CSSProperties['mixBlendMode'],
                }}
              />
            );
          });
        })}
    </div>
  );
}
