/**
 * highlight-layer.tsx — paints saved highlights on a PDF page and renders note pins.
 *
 * Renders between the canvas and the text layer so selection still works on top.
 * All highlight colors come from --color-highlight-* tokens (invariant #6).
 *
 * 10c: highlight rects are now interactive <button> elements (keyboard + mouse).
 *      note-kind annotations render as a dotted underline + margin pin, NOT a fill.
 *      Outer layer stays pointer-events-none; only individual rects are pointer-events-auto.
 */

import { Pin } from 'lucide-react';
import type { CSSProperties } from 'react';

import { resolveAnchorRects } from '@ember/core';
import type { Annotation, HighlightColor, PageTextGeometry } from '@ember/core';

import { cssRectFromBox } from './selection-anchor.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface HighlightLayerProps {
  /** Annotations already filtered to this page number. */
  annotations: Annotation[];
  /** Normalized page geometry for this page (from extractPageGeometry). */
  geometry: PageTextGeometry | undefined;
  /** Rendered page width in CSS pixels. */
  pageWidth: number;
  /** Rendered page height in CSS pixels. */
  pageHeight: number;
  /** Called when the user clicks a highlight rect or note pin. */
  onSelectAnnotation: (annotation: Annotation, rect: Rect) => void;
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
  onSelectAnnotation,
}: HighlightLayerProps) {
  if (geometry === undefined) return null;

  // Flatten into a single array of rendered elements so the outer div's
  // `children` in tests corresponds to actual DOM nodes (no extra wrapper spans).
  const elements: React.ReactNode[] = [];

  for (const annotation of annotations) {
    const boxes = resolveAnchorRects(annotation.anchor, geometry);

    if (annotation.kind === 'note') {
      if (boxes.length === 0) continue;

      const topBox = boxes[0]!;
      const topRect = cssRectFromBox(topBox, pageWidth, pageHeight);

      // Dotted underline buttons for each rect — subtle amber ink line
      for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i]!;
        const rect = cssRectFromBox(box, pageWidth, pageHeight);
        elements.push(
          <button
            key={`${annotation.id}-underline-${i.toString()}`}
            type="button"
            aria-label={`Note underline: "${annotation.anchor.quote}"`}
            onClick={(e) => {
              const el = e.currentTarget;
              const bounding = el.getBoundingClientRect();
              onSelectAnnotation(annotation, {
                left: bounding.left,
                top: bounding.top,
                width: bounding.width,
                height: bounding.height,
              });
            }}
            className="absolute pointer-events-auto focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            style={{
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              // Dashed 3px segments for a warm "pencil underline" look
              borderBottom: '1.5px dashed var(--color-accent)',
              opacity: 0.55,
              background: 'transparent',
              cursor: 'pointer',
            }}
          />,
        );
      }

      // Ember-flame margin pin — warm, rounded, distinctive
      elements.push(
        <button
          key={`${annotation.id}-pin`}
          type="button"
          aria-label={`Note: "${annotation.anchor.quote}"`}
          onClick={(e) => {
            const el = e.currentTarget;
            const bounding = el.getBoundingClientRect();
            onSelectAnnotation(annotation, {
              left: bounding.left,
              top: bounding.top,
              width: bounding.width,
              height: bounding.height,
            });
          }}
          className={[
            'absolute pointer-events-auto',
            'flex items-center justify-center',
            // Teardrop shape via padding + border-radius trick; slightly taller than wide
            'w-[18px] h-[20px]',
            'rounded-t-full rounded-b-[4px]',
            // Warm amber fill — accent at reduced opacity over the page
            'bg-accent text-on-accent',
            'shadow-[0_1px_4px_rgba(0,0,0,0.18)]',
            'hover:scale-110 hover:shadow-[0_2px_6px_rgba(224,112,27,0.35)]',
            'transition-all duration-150 active:scale-95',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          ].join(' ')}
          style={{
            left: Math.max(0, topRect.left - 22),
            top: topRect.top - 2,
          }}
        >
          <Pin size={9} aria-hidden="true" />
        </button>,
      );
    } else {
      // Highlight: render colored fill rects as clickable buttons.
      const colorClass = COLOR_CLASS[annotation.color ?? 'yellow'];
      const hasNote = Boolean(annotation.note);

      for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i]!;
        const rect = cssRectFromBox(box, pageWidth, pageHeight);
        const isFirst = i === 0;

        elements.push(
          <button
            key={`${annotation.id}-${i.toString()}`}
            type="button"
            aria-label={`Highlight: "${annotation.anchor.quote}"`}
            onClick={(e) => {
              const el = e.currentTarget;
              const bounding = el.getBoundingClientRect();
              onSelectAnnotation(annotation, {
                left: bounding.left,
                top: bounding.top,
                width: bounding.width,
                height: bounding.height,
              });
            }}
            className={[
              'absolute rounded-sm pointer-events-auto',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
              colorClass,
            ].join(' ')}
            style={{
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              mixBlendMode: 'var(--highlight-blend, multiply)' as CSSProperties['mixBlendMode'],
            }}
          >
            {/* Note-dot: shown on the first rect of a note-carrying highlight */}
            {isFirst && hasNote && (
              <span
                data-note-dot
                aria-hidden="true"
                className="absolute top-0 right-0 w-2 h-2 rounded-full bg-accent translate-x-1/2 -translate-y-1/2"
              />
            )}
          </button>,
        );
      }
    }
  }

  return (
    // z-10 lifts the interactive annotation buttons ABOVE pdf.js's text layer
    // (.textLayer is position:absolute; inset:0; z-index:0 with no pointer-events:none,
    // so its container otherwise intercepts every click — including the left margin where
    // the note pin sits — and nothing in here is clickable). The outer div stays
    // pointer-events-none so empty areas fall through to the text layer and text stays
    // selectable; only the individual rects/pins (pointer-events-auto) capture clicks.
    <div
      className="absolute inset-0 pointer-events-none z-10"
    >
      {elements}
    </div>
  );
}
