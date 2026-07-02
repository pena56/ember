/**
 * reader-page.tsx — the full-screen PDF reader.
 *
 * Features:
 *  - Continuous scroll (default) with IntersectionObserver-based virtualization
 *  - Paged mode (one page at a time) with prev/next buttons + ←/→ keys
 *  - Uses the app chrome theme (warm-light / warm-dark) so it stays on-brand
 *  - Minimal top bar (back, title, page indicator) + floating control dock
 *    (text size, reading mode) over the shared ambient backdrop
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Annotation, HighlightColor, PageTextGeometry, TextAnchor } from '@ember/core';

import { cn } from '@/lib/utils.js';

import { AmbientBackdrop } from '../shell/ambient-backdrop.js';

import { AnnotationPopover } from './annotation-popover.js';
import { PdfPage } from './pdf-page.js';
import { computePageOffset, resumeScrollTop } from './reading-position.js';
import { SelectionToolbar } from './selection-toolbar.js';
import { useAnnotations } from './use-annotations.js';
import { useCapturePageCount } from './use-capture-page-count.js';
import { usePdfDocument } from './use-pdf-document.js';
import { useReadingPosition } from './use-reading-position.js';
import { useSessionTracking } from './use-session-tracking.js';

// ── Types ─────────────────────────────────────────────────────────────────────

type ReadMode = 'scroll' | 'paged';

interface AnnotationRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The currently-selected annotation (may be a transient unsaved draft for new notes).
 * `isDraft` is true when the annotation has not yet been persisted — the first Save
 * call in the popover will write it via createNote(); closing empty discards it.
 */
interface SelectedAnnotation {
  annotation: Annotation;
  rect: AnnotationRect;
  /** True for a new note that hasn't been saved yet. */
  isDraft?: boolean;
}

interface ReaderPageProps {
  docId: string;
  /** Document title shown in the toolbar. */
  title: string;
  onClose: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Pages outside this buffer from the visible page are not actively rendered. */
const ACTIVE_BUFFER = 2;

/**
 * Text-size steps: the max page-column width (CSS px) per step. Larger width →
 * larger rendered text (the "AA" control). Clamped to the container so the page
 * never overflows the viewport horizontally.
 */
const PAGE_WIDTH_STEPS = [600, 680, 760, 840, 920];
const DEFAULT_SIZE_INDEX = 2;

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div
      className="flex items-center justify-center flex-1 py-24"
      role="status"
      aria-label="Loading document"
    >
      <div className="w-6 h-6 rounded-full border-2 border-line border-t-accent motion-safe:animate-spin" />
    </div>
  );
}

// ── Error / Missing notice ────────────────────────────────────────────────────

function DocumentNotice({
  kind,
  onClose,
}: {
  kind: 'error' | 'missing';
  onClose: () => void;
}) {
  const message =
    kind === 'missing'
      ? 'This document is no longer available in your library.'
      : 'Something went wrong while opening this document.';

  const detail =
    kind === 'missing'
      ? 'The file may have been removed from your device.'
      : 'The file may be corrupted or in an unsupported format.';

  return (
    <div
      className="flex flex-col items-center gap-4 py-24 text-center px-8"
      role="alert"
      aria-live="assertive"
    >
      {/* Soft ember motif, dimmed */}
      <svg
        width="48"
        height="48"
        viewBox="0 0 56 56"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="opacity-30"
      >
        <circle cx="28" cy="28" r="27" className="stroke-line" strokeWidth="1.5" />
        <path
          d="M28 10C28 10 18 22 18 32C18 37.523 22.477 42 28 42C33.523 42 38 37.523 38 32C38 26 34 20 32 16C32 16 31 24 28 26C25 24 28 10 28 10Z"
          className="fill-accent opacity-30"
        />
      </svg>

      <div className="flex flex-col gap-2 max-w-sm">
        <p className="font-serif text-lg text-text">{message}</p>
        <p className="font-sans text-sm text-text-muted">{detail}</p>
      </div>

      <button
        type="button"
        onClick={onClose}
        className={[
          'mt-2 font-sans text-sm px-4 py-2 rounded-md',
          'bg-accent text-on-accent',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          'hover:opacity-90 transition-opacity',
        ].join(' ')}
      >
        Back to Library
      </button>
    </div>
  );
}

// ── Scroll-mode reader ────────────────────────────────────────────────────────

function ScrollReader({
  pdf,
  numPages,
  displayWidth,
  currentPage,
  onPageChange,
  onScroll,
  annotationsByPage,
  pageGeometries,
  onTextGeometry,
  onSelectAnnotation,
}: {
  pdf: import('pdfjs-dist').PDFDocumentProxy;
  numPages: number;
  displayWidth: number;
  currentPage: number;
  onPageChange: (p: number) => void;
  onScroll?: () => void;
  annotationsByPage: Map<number, Annotation[]>;
  pageGeometries: Map<number, PageTextGeometry>;
  onTextGeometry: (pageNumber: number, geometry: PageTextGeometry) => void;
  onSelectAnnotation: (annotation: Annotation, rect: AnnotationRect) => void;
}) {
  const pageRefs = useRef<Map<number, Element>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);
  // Track which pages are intersecting
  const intersectingRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageNum = Number(entry.target.getAttribute('data-page'));
          if (entry.isIntersecting) {
            intersectingRef.current.add(pageNum);
          } else {
            intersectingRef.current.delete(pageNum);
          }
        }

        // Most visible = smallest page number that is intersecting
        const visible = Array.from(intersectingRef.current).sort((a, b) => a - b);
        if (visible.length > 0 && visible[0] !== undefined) {
          onPageChange(visible[0]);
        }
      },
      { threshold: 0.1 },
    );

    observerRef.current = observer;

    // Observe all currently mounted page containers
    for (const el of pageRefs.current.values()) {
      observer.observe(el);
    }

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [numPages, onPageChange]);

  const setPageRef = useCallback((el: Element | null, pageNumber: number) => {
    if (el) {
      pageRefs.current.set(pageNumber, el);
      observerRef.current?.observe(el);
    } else {
      const old = pageRefs.current.get(pageNumber);
      if (old) observerRef.current?.unobserve(old);
      pageRefs.current.delete(pageNumber);
    }
  }, []);

  // Scroll listener — notifies parent to debounce-save position on scroll settle
  useEffect(() => {
    if (!onScroll) return;
    const handler = onScroll;
    window.addEventListener('scroll', handler, { passive: true });
    return () => { window.removeEventListener('scroll', handler); };
  }, [onScroll]);

  return (
    <div className="flex flex-col items-center gap-8 py-8 px-4">
      {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => {
        const isActive = Math.abs(pageNum - currentPage) <= ACTIVE_BUFFER;
        return (
          <div
            key={pageNum}
            ref={(el) => { setPageRef(el, pageNum); }}
            data-page={pageNum}
          >
            <PdfPage
              pdf={pdf}
              pageNumber={pageNum}
              displayWidth={displayWidth}
              active={isActive}
              annotations={annotationsByPage.get(pageNum) ?? []}
              geometry={pageGeometries.get(pageNum)}
              onTextGeometry={(geo) => { onTextGeometry(pageNum, geo); }}
              onSelectAnnotation={onSelectAnnotation}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Paged-mode reader ─────────────────────────────────────────────────────────

function PagedReader({
  pdf,
  numPages,
  displayWidth,
  currentPage,
  onPageChange,
  annotationsByPage,
  pageGeometries,
  onTextGeometry,
  onSelectAnnotation,
}: {
  pdf: import('pdfjs-dist').PDFDocumentProxy;
  numPages: number;
  displayWidth: number;
  currentPage: number;
  onPageChange: (p: number) => void;
  annotationsByPage: Map<number, Annotation[]>;
  pageGeometries: Map<number, PageTextGeometry>;
  onTextGeometry: (pageNumber: number, geometry: PageTextGeometry) => void;
  onSelectAnnotation: (annotation: Annotation, rect: AnnotationRect) => void;
}) {
  const goNext = () => { onPageChange(Math.min(currentPage + 1, numPages)); };
  const goPrev = () => { onPageChange(Math.max(currentPage - 1, 1)); };

  // ←/→ (and ↑/↓) key navigation when in paged mode. Inlined so the effect
  // depends only on the values it reads — no per-render listener churn.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        onPageChange(Math.min(currentPage + 1, numPages));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        onPageChange(Math.max(currentPage - 1, 1));
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => { window.removeEventListener('keydown', handleKey); };
  }, [currentPage, numPages, onPageChange]);

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-4 py-8 gap-6">
      <PdfPage
        pdf={pdf}
        pageNumber={currentPage}
        displayWidth={displayWidth}
        active
        annotations={annotationsByPage.get(currentPage) ?? []}
        geometry={pageGeometries.get(currentPage)}
        onTextGeometry={(geo) => { onTextGeometry(currentPage, geo); }}
        onSelectAnnotation={onSelectAnnotation}
      />

      {/* Prev / Next buttons */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={goPrev}
          disabled={currentPage <= 1}
          aria-label="Previous page"
          className={cn(
            'flex items-center gap-1.5 font-sans text-sm px-4 py-2 rounded-sm',
            'border border-line text-text bg-surface-raised shadow-float-sm',
            'disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            'hover:bg-surface transition-colors',
          )}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Prev
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={currentPage >= numPages}
          aria-label="Next page"
          className={cn(
            'flex items-center gap-1.5 font-sans text-sm px-4 py-2 rounded-sm',
            'border border-line text-text bg-surface-raised shadow-float-sm',
            'disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            'hover:bg-surface transition-colors',
          )}
        >
          Next
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// ── Reader top bar ────────────────────────────────────────────────────────────
// Deliberately minimal so the page stays the hero: back, title, page indicator.
// The reading controls live in the floating dock below.

function ReaderTopBar({
  title,
  currentPage,
  numPages,
  mode,
  onClose,
}: {
  title: string;
  currentPage: number;
  numPages: number;
  mode: ReadMode;
  onClose: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        {/* Back to Library */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to Library"
          className={cn(
            'flex shrink-0 items-center gap-1 rounded-sm px-2 py-1 font-sans text-sm',
            'text-text-muted hover:text-text transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          )}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Library
        </button>

        {/* Title */}
        <h1
          className="min-w-0 flex-1 truncate text-center font-serif text-sm font-medium text-text"
          title={title}
        >
          {title}
        </h1>

        {/* Page indicator */}
        <span
          className="w-24 shrink-0 text-right font-sans text-xs tabular-nums text-text-muted"
          // Announce on explicit page turns (paged mode); stay silent while
          // scrolling, where currentPage changes on every scroll tick.
          aria-live={mode === 'paged' ? 'polite' : 'off'}
          aria-atomic="true"
        >
          {numPages > 0 ? `page ${currentPage.toString()} of ${numPages.toString()}` : ''}
        </span>
      </div>
    </header>
  );
}

// ── Reader control dock ─────────────────────────────────────────────────────────
// One floating card, bottom-center, grouping the reading controls: text size and
// reading mode. On-brand app chrome tokens, with the ember accent marking the
// active segment.

/** Shared segmented-control button styling. */
function segClass(active: boolean): string {
  return cn(
    'rounded-[6px] px-2.5 py-1 font-sans text-xs transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
    active
      ? 'bg-accent/15 font-medium text-text'
      : 'text-text-muted hover:bg-surface hover:text-text',
  );
}

function DockDivider() {
  return <div aria-hidden="true" className="h-5 w-px shrink-0 bg-line" />;
}

function ReaderDock({
  sizeIndex,
  onSizeChange,
  mode,
  onModeChange,
}: {
  sizeIndex: number;
  onSizeChange: (delta: number) => void;
  mode: ReadMode;
  onModeChange: (m: ReadMode) => void;
}) {
  const canDecrease = sizeIndex > 0;
  const canIncrease = sizeIndex < PAGE_WIDTH_STEPS.length - 1;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-4">
      <div
        className={cn(
          'pointer-events-auto flex flex-wrap items-center justify-center gap-2',
          'rounded-md border border-line bg-surface-raised px-2 py-1.5 shadow-float',
        )}
      >
        {/* Text size */}
        <div className="flex items-center gap-0.5" role="group" aria-label="Text size">
          <button
            type="button"
            onClick={() => { onSizeChange(-1); }}
            disabled={!canDecrease}
            aria-label="Decrease text size"
            className={cn(
              'flex size-7 items-center justify-center rounded-[6px] leading-none text-text-muted',
              'hover:bg-surface hover:text-text transition-colors',
              'disabled:pointer-events-none disabled:opacity-30',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
            )}
          >
            <span className="font-serif text-[11px]" aria-hidden="true">A</span>
          </button>
          <button
            type="button"
            onClick={() => { onSizeChange(1); }}
            disabled={!canIncrease}
            aria-label="Increase text size"
            className={cn(
              'flex size-7 items-center justify-center rounded-[6px] leading-none text-text-muted',
              'hover:bg-surface hover:text-text transition-colors',
              'disabled:pointer-events-none disabled:opacity-30',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
            )}
          >
            <span className="font-serif text-[17px]" aria-hidden="true">A</span>
          </button>
        </div>

        <DockDivider />

        {/* Reading mode */}
        <div className="flex items-center gap-0.5" role="group" aria-label="Reading mode">
          {(['scroll', 'paged'] as ReadMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { onModeChange(m); }}
              aria-pressed={mode === m}
              className={segClass(mode === m)}
            >
              {m === 'scroll' ? 'Scroll' : 'Paged'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ReaderPage({ docId, title, onClose }: ReaderPageProps) {
  const { status, pdf, numPages } = usePdfDocument(docId);
  const { annotationsByPage, createHighlight, createNote, updateAnnotation, removeAnnotation } = useAnnotations(docId);

  // Selected annotation state — holds the currently-open annotation (persisted or draft).
  const [selected, setSelected] = useState<SelectedAnnotation | null>(null);

  const handleSelectAnnotation = useCallback((annotation: Annotation, rect: AnnotationRect) => {
    setSelected({ annotation, rect });
  }, []);

  const handleClosePopover = useCallback(() => {
    setSelected(null);
  }, []);

  // Handle recolor: update color then close popover.
  const handleRecolor = useCallback(async (color: HighlightColor) => {
    if (!selected) return;
    await updateAnnotation({ annotation: selected.annotation, patch: { color } });
    setSelected(null);
  }, [selected, updateAnnotation]);

  // Handle note edit: update note text then close popover.
  const handleEditNote = useCallback(async (text: string) => {
    if (!selected) return;
    const { annotation, rect, isDraft } = selected;

    if (isDraft) {
      // First save for a new note — create the record now.
      if (text.trim() === '') {
        // Empty note for a draft — discard (no record written).
        setSelected(null);
        return;
      }
      const created = await createNote({ anchor: annotation.anchor, note: text.trim() });
      // Update selection to the now-persisted record.
      setSelected({ annotation: created, rect });
    } else {
      await updateAnnotation({ annotation, patch: { note: text.trim() === '' ? null : text.trim() } });
      setSelected(null);
    }
  }, [selected, createNote, updateAnnotation]);

  // Handle delete: remove annotation then close popover.
  const handleDelete = useCallback(async () => {
    if (!selected) return;
    const { annotation, isDraft } = selected;
    if (!isDraft) {
      await removeAnnotation(annotation.id);
    }
    setSelected(null);
  }, [selected, removeAnnotation]);

  // Handle Note toolbar button: open a draft note editor without persisting.
  const handleCreateNote = useCallback((_input: { anchor: TextAnchor }) => {
    // Build a transient draft annotation (not yet persisted).
    // The popover's first Save will call createNote(); closing empty discards it.
    const draft: Annotation = {
      id: `draft-${Date.now().toString()}`,
      docId,
      kind: 'note',
      anchor: _input.anchor,
      note: '',
      createdAt: Date.now(),
      updatedAt: '',
    };
    // Position the draft popover near the selection (use viewport center as fallback).
    const draftRect: AnnotationRect = {
      left: window.innerWidth / 2 - 128,
      top: window.innerHeight / 2 - 60,
      width: 0,
      height: 0,
    };
    setSelected({ annotation: draft, rect: draftRect, isDraft: true });
  }, [docId]);

  // Page geometry map — filled via onTextGeometry from each PdfPage render.
  const [pageGeometries, setPageGeometries] = useState<Map<number, PageTextGeometry>>(new Map());
  const pageGeometriesRef = useRef<Map<number, PageTextGeometry>>(new Map());

  const handleTextGeometry = useCallback((pageNumber: number, geometry: PageTextGeometry) => {
    pageGeometriesRef.current = new Map(pageGeometriesRef.current).set(pageNumber, geometry);
    setPageGeometries(pageGeometriesRef.current);
  }, []);

  const [mode, setMode] = useState<ReadMode>('scroll');
  // currentPage is tracked alongside the docId that produced it so that switching
  // documents resets to page 1 without needing a separate useEffect setState call.
  const [pageState, setPageState] = useState<{ docId: string; page: number }>({
    docId,
    page: 1,
  });
  const currentPage =
    pageState.docId === docId ? pageState.page : 1;
  const currentPageRef = useRef(currentPage);
  const modeRef = useRef(mode);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const setCurrentPage = (p: number) => {
    setPageState({ docId, page: p });
  };
  const containerRef = useRef<HTMLDivElement>(null);

  // Text size (the "AA" control): an index into PAGE_WIDTH_STEPS. A wider page
  // column renders larger text. Held in memory for the session.
  const [sizeIndex, setSizeIndex] = useState(DEFAULT_SIZE_INDEX);
  const changeSize = useCallback((delta: number) => {
    setSizeIndex((i) => Math.max(0, Math.min(PAGE_WIDTH_STEPS.length - 1, i + delta)));
  }, []);

  // Measured content width; display width is derived so a size change and a
  // resize both flow through the same clamp (page never overflows the viewport).
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setContainerWidth(entry.contentRect.width);
    });

    observer.observe(el);
    return () => { observer.disconnect(); };
  }, []);

  const displayWidth = useMemo(() => {
    const maxWidth = PAGE_WIDTH_STEPS[sizeIndex] ?? PAGE_WIDTH_STEPS[DEFAULT_SIZE_INDEX]!;
    const available = containerWidth > 0 ? containerWidth - 32 : maxWidth;
    return Math.max(280, Math.min(maxWidth, available));
  }, [sizeIndex, containerWidth]);

  // ── Reading position helpers ─────────────────────────────────────────────────

  /** Get the page wrapper element for a given 1-based page number. */
  const getPageElement = useCallback((page: number): HTMLElement | null => {
    return (containerRef.current?.querySelector(`[data-page="${page.toString()}"]`) as HTMLElement | null) ?? null;
  }, []);

  const getCurrent = useCallback((): { page: number; offset: number } => {
    const page = currentPageRef.current;
    if (modeRef.current === 'paged') {
      return { page, offset: 0 };
    }
    // Scroll mode: compute within-page offset using viewport-relative rects
    const pageEl = getPageElement(page);
    if (!pageEl) return { page, offset: 0 };
    const pageRect = pageEl.getBoundingClientRect();
    const offset = computePageOffset({
      pageTop: pageRect.top,
      pageHeight: pageRect.height,
      viewportTop: 0, // viewport top is 0 in viewport-relative coords
    });
    return { page, offset };
  }, [getPageElement]);

  const { scheduleSave } = useReadingPosition({
    docId,
    ready: status === 'ready',
    getCurrent,
    onResume: useCallback(
      (saved) => {
        setCurrentPage(saved.page);
        if (modeRef.current === 'scroll') {
          // Defer until the page element is mounted/measured
          requestAnimationFrame(() => {
            const pageEl = getPageElement(saved.page);
            if (!pageEl) return;
            const scrollTop = resumeScrollTop({
              pageOffsetTop: pageEl.offsetTop,
              pageHeight: pageEl.offsetHeight,
              offset: saved.offset,
            });
            window.scrollTo({ top: scrollTop, behavior: 'instant' });
          });
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [getPageElement],
    ),
  });

  const tracking = useSessionTracking({
    docId,
    ready: status === 'ready',
    getPage: () => currentPageRef.current,
  });

  useCapturePageCount({ docId, ready: status === 'ready', numPages });

  return (
    <div className="min-h-screen flex flex-col text-text">
      {/* Same ambient backdrop as the rest of the app — reader stays on-brand */}
      <AmbientBackdrop />

      {/* Floating highlight swatch toolbar — rendered once at reader level */}
      <SelectionToolbar
        pageGeometries={pageGeometries}
        onCreate={createHighlight}
        onCreateNote={handleCreateNote}
      />

      {/* Annotation editor popover — rendered once at reader level */}
      <AnnotationPopover
        annotation={selected?.annotation ?? null}
        rect={selected?.rect ?? null}
        onRecolor={(color) => { void handleRecolor(color); }}
        onEditNote={(text) => { void handleEditNote(text); }}
        onDelete={() => { void handleDelete(); }}
        onClose={handleClosePopover}
      />

      <ReaderTopBar
        title={title}
        currentPage={currentPage}
        numPages={numPages}
        mode={mode}
        onClose={onClose}
      />

      {/* Floating control dock — only once the document is ready to read */}
      {status === 'ready' && (
        <ReaderDock
          sizeIndex={sizeIndex}
          onSizeChange={changeSize}
          mode={mode}
          onModeChange={setMode}
        />
      )}

      {/* Content area — pb leaves room for the floating dock */}
      <div ref={containerRef} className="flex-1 flex flex-col pb-24">
        {status === 'loading' && <Spinner />}

        {(status === 'error' || status === 'missing') && (
          <DocumentNotice kind={status} onClose={onClose} />
        )}

        {status === 'ready' && pdf !== undefined && (
          <>
            {mode === 'scroll' ? (
              <ScrollReader
                pdf={pdf}
                numPages={numPages}
                displayWidth={displayWidth}
                currentPage={currentPage}
                onPageChange={(p) => { setCurrentPage(p); scheduleSave(); tracking.onPage(p); }}
                onScroll={() => { scheduleSave(); tracking.onActivity(); }}
                annotationsByPage={annotationsByPage}
                pageGeometries={pageGeometries}
                onTextGeometry={handleTextGeometry}
                onSelectAnnotation={handleSelectAnnotation}
              />
            ) : (
              <PagedReader
                pdf={pdf}
                numPages={numPages}
                displayWidth={displayWidth}
                currentPage={currentPage}
                onPageChange={(p) => { setCurrentPage(p); scheduleSave(); tracking.onPage(p); }}
                annotationsByPage={annotationsByPage}
                pageGeometries={pageGeometries}
                onTextGeometry={handleTextGeometry}
                onSelectAnnotation={handleSelectAnnotation}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
