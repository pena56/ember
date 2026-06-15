/**
 * annotation-popover.tsx — controlled editor popover for highlights and notes.
 *
 * Rendered once at reader level, anchored to the clicked annotation rect.
 * Uses a fixed-positioned panel for jsdom testability; Esc / click-outside
 * close are handled manually.
 *
 * Design: warm Ember marginalia card — amber ink on warm-white stock. The swatches
 * sit in a quiet row like ink blots; the textarea has the texture of a notebook page;
 * delete is a whisper, not a siren. All colors from tokens (invariant #6).
 */

import { Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { HIGHLIGHT_COLORS } from '@ember/core';
import type { Annotation, HighlightColor } from '@ember/core';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface AnnotationPopoverProps {
  annotation: Annotation | null;
  rect: Rect | null;
  onRecolor: (color: HighlightColor) => void;
  onEditNote: (text: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

// ── Color swatch map ──────────────────────────────────────────────────────────

const SWATCH_BG: Record<HighlightColor, string> = {
  yellow: 'bg-highlight-yellow',
  green:  'bg-highlight-green',
  blue:   'bg-highlight-blue',
  pink:   'bg-highlight-pink',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function AnnotationPopover({
  annotation,
  rect,
  onRecolor,
  onEditNote,
  onDelete,
  onClose,
}: AnnotationPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Seed noteText from annotation.note. Track previous id to reset inline
  // during render when the selection changes (avoids setState-in-effect).
  const [noteText, setNoteText] = useState<string>(() => annotation?.note ?? '');
  const prevIdRef = useRef<string | null | undefined>(annotation?.id);
  if (annotation?.id !== prevIdRef.current) {
    prevIdRef.current = annotation?.id;
    setNoteText(annotation?.note ?? '');
  }

  // Esc closes.
  useEffect(() => {
    if (!annotation || !rect) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => { document.removeEventListener('keydown', handleKeyDown); };
  }, [annotation, rect, onClose]);

  // Click outside closes.
  useEffect(() => {
    if (!annotation || !rect) return;
    function handlePointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => { document.removeEventListener('pointerdown', handlePointerDown, true); };
  }, [annotation, rect, onClose]);

  if (!annotation || !rect) return null;

  const isNote = annotation.kind === 'note';
  const noteIsEmpty = noteText.trim() === '';

  // Position below the annotation rect, clamped within viewport.
  const PANEL_W = 264;
  const ARROW_H = 6;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_W - 8));
  const top = rect.top + rect.height + ARROW_H + 4;

  function handleSaveNote() {
    if (noteIsEmpty && isNote) return;
    onEditNote(noteText.trim());
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={isNote ? 'Edit note' : 'Edit highlight'}
      className="fixed z-50 font-sans"
      style={{ left, top, width: PANEL_W }}
      onPointerDown={(e) => { e.stopPropagation(); }}
    >
      {/* Small upward-pointing accent line as visual anchor */}
      <div
        aria-hidden="true"
        className="mx-5 h-1 rounded-b-none rounded-t-full bg-accent opacity-70"
        style={{ width: 24 }}
      />

      {/* Card body */}
      <div
        className={[
          'relative flex flex-col gap-3',
          'bg-surface-raised border border-line rounded-xl',
          'shadow-[0_8px_32px_-4px_rgba(0,0,0,0.12),0_2px_8px_-2px_rgba(0,0,0,0.06)]',
          'p-3.5',
        ].join(' ')}
      >
        {/* Header: kind label + close */}
        <div className="flex items-center justify-between min-h-[20px]">
          <span
            className={[
              'text-[10px] font-semibold tracking-widest uppercase',
              'text-accent opacity-80',
            ].join(' ')}
          >
            {isNote ? 'Note' : 'Highlight'}
          </span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={[
              'w-5 h-5 flex items-center justify-center rounded-md',
              // App-theme muted token (legible on surface-raised in both themes).
              'text-text-muted hover:text-text',
              'transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            ].join(' ')}
          >
            <X size={12} aria-hidden="true" />
          </button>
        </div>

        {/* Color swatches — highlight only */}
        {!isNote && (
          <div
            role="group"
            aria-label="Recolor highlight"
            className="flex items-center gap-2"
          >
            {HIGHLIGHT_COLORS.map((color) => {
              const active = color === annotation.color;
              return (
                <button
                  key={color}
                  type="button"
                  aria-label={`Recolor ${color}`}
                  aria-pressed={active}
                  onClick={() => { onRecolor(color); }}
                  className={[
                    'relative w-7 h-7 rounded-full',
                    'transition-all duration-150',
                    'hover:scale-110 active:scale-95',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                    SWATCH_BG[color],
                    // Active: a crisp amber ring with slight shadow
                    active
                      ? 'ring-[2.5px] ring-accent ring-offset-[2px] ring-offset-surface-raised shadow-sm'
                      : 'opacity-80 hover:opacity-100',
                  ].join(' ')}
                >
                  {/* Inner gloss dot for tactile depth */}
                  <span
                    aria-hidden="true"
                    className="absolute top-[3px] left-[3px] w-2 h-2 rounded-full bg-white opacity-30 pointer-events-none"
                  />
                </button>
              );
            })}
          </div>
        )}

        {/* Note textarea */}
        <div className="flex flex-col gap-2">
          <textarea
            // eslint-disable-next-line jsx-a11y/no-autofocus -- transient editor popover; focus belongs in the field the user just opened
            autoFocus
            aria-label="Note text"
            placeholder="Add a note…"
            rows={isNote ? 4 : 3}
            value={noteText}
            onChange={(e) => { setNoteText(e.target.value); }}
            className={[
              'w-full resize-none rounded-lg px-3 py-2 text-sm leading-relaxed',
              'bg-reader-bg border border-line',
              'text-reader-text placeholder:text-reader-text placeholder:opacity-35',
              'focus-visible:outline-none focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent/30',
              'transition-[border-color,box-shadow] duration-150',
            ].join(' ')}
          />

          {/* Save row */}
          <div className="flex items-center justify-between">
            {/* Delete — calm, reachable, not alarming */}
            <button
              type="button"
              aria-label={isNote ? 'Delete note' : 'Delete highlight'}
              onClick={onDelete}
              className={[
                // Use the app-theme muted-text token (legible on surface-raised in BOTH
                // light + dark). The card is bg-surface-raised (app theme), so reader-text
                // — locked to paper-dark — went invisible on the dark card. Calm, not faint.
                'flex items-center gap-1 text-[11px] text-text-muted',
                'hover:text-accent transition-colors duration-150',
                'rounded-md px-1.5 py-1',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              ].join(' ')}
            >
              <Trash2 size={11} aria-hidden="true" />
              <span>Remove</span>
            </button>

            <button
              type="button"
              aria-label="Save note"
              disabled={isNote && noteIsEmpty}
              onClick={handleSaveNote}
              className={[
                'text-[11px] font-semibold px-3 py-1.5 rounded-lg',
                'bg-accent text-on-accent',
                'hover:opacity-90 active:scale-95',
                'transition-all duration-100',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                'disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100',
              ].join(' ')}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
