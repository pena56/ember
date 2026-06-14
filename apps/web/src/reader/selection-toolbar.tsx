/**
 * selection-toolbar.tsx — floating swatch toolbar for creating highlights and notes.
 *
 * Appears above a non-collapsed text selection inside the reader.
 * Contains 4 color swatch buttons + a Note button (added in 10c).
 * Tapping a swatch creates a highlight; tapping Note calls onCreateNote.
 */

import { StickyNote } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { HIGHLIGHT_COLORS } from '@ember/core';
import type { HighlightColor, PageTextGeometry, TextAnchor } from '@ember/core';

import { selectionToTextAnchor } from './selection-anchor.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SelectionToolbarProps {
  /** Map of page number → geometry for all loaded pages. */
  pageGeometries: Map<number, PageTextGeometry>;
  /** Called when the user taps a color swatch after a valid selection. */
  onCreate: (input: { anchor: TextAnchor; color: HighlightColor }) => void;
  /** Called when the user taps the Note button after a valid selection. */
  onCreateNote?: (input: { anchor: TextAnchor }) => void;
}

// ── Position state ────────────────────────────────────────────────────────────

interface ToolbarPosition {
  x: number;
  y: number;
}

// ── Color class map ───────────────────────────────────────────────────────────

const SWATCH_CLASS: Record<HighlightColor, string> = {
  yellow: 'bg-highlight-yellow',
  green:  'bg-highlight-green',
  blue:   'bg-highlight-blue',
  pink:   'bg-highlight-pink',
};

// ── Toolbar height (px) used for "flip below" guard ──────────────────────────

const TOOLBAR_HEIGHT = 44;
// 4 × 36px swatches + 1 × 36px Note button + 5 × 8px gap + 1px divider ≈ 220px
const TOOLBAR_WIDTH = 220;
const OFFSET_ABOVE = 8; // gap between selection top and toolbar bottom

// ── Component ─────────────────────────────────────────────────────────────────

export function SelectionToolbar({ pageGeometries, onCreate, onCreateNote }: SelectionToolbarProps) {
  const [position, setPosition] = useState<ToolbarPosition | null>(null);
  // We stash the current range + context in a ref so the swatch click handler
  // can access it without being recreated on every render.
  const selectionRef = useRef<{
    range: Range;
    page: number;
    root: HTMLElement;
    geometry: PageTextGeometry;
  } | null>(null);

  const toolbarRef = useRef<HTMLDivElement>(null);

  const updateFromSelection = useCallback(() => {
    const sel = window.getSelection();

    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setPosition(null);
      selectionRef.current = null;
      return;
    }

    const range = sel.getRangeAt(0);
    if (range.collapsed) {
      setPosition(null);
      selectionRef.current = null;
      return;
    }

    // Walk up from anchorNode to find the [data-page] wrapper.
    let node: Node | null = range.startContainer;
    let pageWrapper: Element | null = null;
    while (node) {
      if (node instanceof Element && node.hasAttribute('data-page')) {
        pageWrapper = node;
        break;
      }
      node = node.parentNode;
    }

    if (!pageWrapper) {
      setPosition(null);
      selectionRef.current = null;
      return;
    }

    const pageNumber = parseInt(pageWrapper.getAttribute('data-page') ?? '0', 10);
    const geometry = pageGeometries.get(pageNumber);

    if (!geometry) {
      setPosition(null);
      selectionRef.current = null;
      return;
    }

    // Find the .textLayer root under the page wrapper.
    const textLayerRoot = pageWrapper.querySelector('.textLayer');
    if (!(textLayerRoot instanceof HTMLElement)) {
      setPosition(null);
      selectionRef.current = null;
      return;
    }

    selectionRef.current = {
      range,
      page: pageNumber,
      root: textLayerRoot,
      geometry,
    };

    // Position toolbar centered above the selection rect.
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setPosition(null);
      selectionRef.current = null;
      return;
    }

    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    // Default: center above selection, OFFSET_ABOVE gap.
    let x = rect.left + rect.width / 2 - TOOLBAR_WIDTH / 2;
    let y = rect.top - TOOLBAR_HEIGHT - OFFSET_ABOVE;

    // Flip below if too close to the top edge.
    if (y < 4) {
      y = rect.bottom + OFFSET_ABOVE;
    }

    // Clamp horizontally within viewport.
    x = Math.max(4, Math.min(x, viewportW - TOOLBAR_WIDTH - 4));
    // Clamp vertically within viewport.
    y = Math.max(4, Math.min(y, viewportH - TOOLBAR_HEIGHT - 4));

    setPosition({ x, y });
  }, [pageGeometries]);

  useEffect(() => {
    let rafId: number | undefined;

    function schedule() {
      if (rafId !== undefined) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateFromSelection);
    }

    document.addEventListener('selectionchange', schedule);
    window.addEventListener('mouseup', schedule);
    window.addEventListener('keyup', schedule);

    return () => {
      document.removeEventListener('selectionchange', schedule);
      window.removeEventListener('mouseup', schedule);
      window.removeEventListener('keyup', schedule);
      if (rafId !== undefined) cancelAnimationFrame(rafId);
    };
  }, [updateFromSelection]);

  const handleSwatchClick = useCallback(
    (color: HighlightColor) => {
      const ctx = selectionRef.current;
      if (!ctx) return;

      const anchor = selectionToTextAnchor({
        root: ctx.root,
        page: ctx.page,
        range: ctx.range,
        geometry: ctx.geometry,
      });

      if (anchor !== null) {
        onCreate({ anchor, color });
      }

      window.getSelection()?.removeAllRanges();
      setPosition(null);
      selectionRef.current = null;
    },
    [onCreate],
  );

  const handleNoteClick = useCallback(() => {
    const ctx = selectionRef.current;
    if (!ctx || !onCreateNote) return;

    const anchor = selectionToTextAnchor({
      root: ctx.root,
      page: ctx.page,
      range: ctx.range,
      geometry: ctx.geometry,
    });

    if (anchor !== null) {
      onCreateNote({ anchor });
    }

    window.getSelection()?.removeAllRanges();
    setPosition(null);
    selectionRef.current = null;
  }, [onCreateNote]);

  if (!position) return null;

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Highlight color"
      className={[
        'fixed z-50 flex items-center gap-1.5 px-2 py-1.5',
        // Warm glassy card — thin border, soft shadow, slight warmth in bg
        'bg-surface-raised/95 backdrop-blur-sm',
        'rounded-xl border border-line',
        'shadow-[0_4px_24px_-4px_rgba(0,0,0,0.15),0_1px_4px_-1px_rgba(0,0,0,0.08)]',
      ].join(' ')}
      style={{ left: position.x, top: position.y }}
      onMouseDown={(e) => { e.preventDefault(); }}
    >
      {HIGHLIGHT_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Highlight ${color}`}
          onClick={() => { handleSwatchClick(color); }}
          className={[
            'relative w-7 h-7 rounded-full',
            'transition-all duration-150',
            'hover:scale-110 active:scale-95',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            SWATCH_CLASS[color],
            'opacity-85 hover:opacity-100',
          ].join(' ')}
        >
          {/* Inner gloss — gives swatches a slight ink-blot depth */}
          <span
            aria-hidden="true"
            className="absolute top-[3px] left-[3px] w-[8px] h-[8px] rounded-full bg-white opacity-30 pointer-events-none"
          />
        </button>
      ))}

      {/* Divider */}
      <div
        aria-hidden="true"
        className="w-px h-5 mx-0.5 rounded-full bg-line shrink-0"
      />

      {/* Note button — accent-tinted so it reads as distinct from the swatches */}
      <button
        type="button"
        aria-label="Add note"
        onClick={handleNoteClick}
        className={[
          'w-7 h-7 rounded-lg flex items-center justify-center',
          'text-accent bg-accent/8 hover:bg-accent/15',
          'transition-all duration-150 active:scale-95',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        ].join(' ')}
      >
        <StickyNote size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
