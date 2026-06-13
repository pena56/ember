/**
 * reader-page.tsx — the full-screen PDF reader.
 *
 * Features:
 *  - Continuous scroll (default) with IntersectionObserver-based virtualization
 *  - Paged mode (one page at a time) with prev/next buttons + ←/→ keys
 *  - Reader theme (paper / sepia / night) independent of app chrome
 *  - Toolbar: back chevron, title, page indicator, mode toggle, theme control
 *
 * Navigation: state-based (openDocId in App) — no router dep.
 * Does NOT persist reading position (unit 06) or render highlights (unit 10).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { ReaderThemeName } from '@ember/tokens';

import { PdfPage } from './pdf-page.js';
import { computePageOffset, resumeScrollTop } from './reading-position.js';
import { useCapturePageCount } from './use-capture-page-count.js';
import { usePdfDocument } from './use-pdf-document.js';
import { useReadingPosition } from './use-reading-position.js';
import { useSessionTracking } from './use-session-tracking.js';

// ── Types ─────────────────────────────────────────────────────────────────────

type ReadMode = 'scroll' | 'paged';

interface ReaderPageProps {
  docId: string;
  /** Document title shown in the toolbar. */
  title: string;
  onClose: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const READER_THEMES: ReaderThemeName[] = ['paper', 'sepia', 'night'];
const THEME_LABELS: Record<ReaderThemeName, string> = {
  paper: 'Paper',
  sepia: 'Sepia',
  night: 'Night',
};

/** Pages outside this buffer from the visible page are not actively rendered. */
const ACTIVE_BUFFER = 2;

/** Max display width for the page column (CSS px). */
const PAGE_MAX_WIDTH = 720;

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
        <p className="font-serif text-lg text-reader-text">{message}</p>
        <p className="font-sans text-sm text-reader-text opacity-60">{detail}</p>
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
}: {
  pdf: import('pdfjs-dist').PDFDocumentProxy;
  numPages: number;
  displayWidth: number;
  currentPage: number;
  onPageChange: (p: number) => void;
  onScroll?: () => void;
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
}: {
  pdf: import('pdfjs-dist').PDFDocumentProxy;
  numPages: number;
  displayWidth: number;
  currentPage: number;
  onPageChange: (p: number) => void;
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
      />

      {/* Prev / Next buttons */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={goPrev}
          disabled={currentPage <= 1}
          aria-label="Previous page"
          className={[
            'font-sans text-sm px-4 py-2 rounded-md border border-line',
            'text-reader-text bg-reader-bg',
            'disabled:opacity-30 disabled:cursor-not-allowed',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            'hover:bg-line transition-colors',
          ].join(' ')}
        >
          ← Prev
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={currentPage >= numPages}
          aria-label="Next page"
          className={[
            'font-sans text-sm px-4 py-2 rounded-md border border-line',
            'text-reader-text bg-reader-bg',
            'disabled:opacity-30 disabled:cursor-not-allowed',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            'hover:bg-line transition-colors',
          ].join(' ')}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

// ── Reader toolbar ────────────────────────────────────────────────────────────

function ReaderToolbar({
  title,
  currentPage,
  numPages,
  mode,
  readerTheme,
  onClose,
  onModeChange,
  onThemeChange,
}: {
  title: string;
  currentPage: number;
  numPages: number;
  mode: ReadMode;
  readerTheme: ReaderThemeName;
  onClose: () => void;
  onModeChange: (m: ReadMode) => void;
  onThemeChange: (t: ReaderThemeName) => void;
}) {
  return (
    <header className="sticky top-0 z-10 bg-reader-bg border-b border-line">
      <div className="mx-auto max-w-4xl px-4 py-2 flex items-center gap-3 flex-wrap">
        {/* Back to Library */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to Library"
          className={[
            'flex items-center gap-1.5 font-sans text-sm text-reader-text',
            'shrink-0 rounded px-2 py-1',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            'hover:opacity-70 transition-opacity',
          ].join(' ')}
        >
          {/* Chevron left */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M10 4L6 8L10 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Library
        </button>

        {/* Spacer */}
        <div className="flex-1 min-w-0">
          <p
            className="font-serif text-sm font-medium text-reader-text truncate"
            title={title}
          >
            {title}
          </p>
        </div>

        {/* Page indicator */}
        {numPages > 0 && (
          <span
            className="font-sans text-xs text-reader-text opacity-60 shrink-0 tabular-nums"
            // Announce on explicit page turns (paged mode); stay silent while
            // scrolling, where currentPage changes on every scroll tick.
            aria-live={mode === 'paged' ? 'polite' : 'off'}
            aria-atomic="true"
          >
            {`page ${currentPage.toString()} of ${numPages.toString()}`}
          </span>
        )}

        {/* Scroll / Paged mode toggle */}
        <div
          className="flex rounded-md overflow-hidden border border-line shrink-0"
          role="group"
          aria-label="Reading mode"
        >
          {(['scroll', 'paged'] as ReadMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { onModeChange(m); }}
              aria-pressed={mode === m}
              className={[
                'font-sans text-xs px-2.5 py-1 transition-colors capitalize',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                mode === m
                  ? 'text-reader-text border-b-2 border-accent font-medium bg-reader-bg'
                  : 'text-reader-text opacity-50 hover:opacity-80 border-b-2 border-transparent bg-reader-bg',
              ].join(' ')}
            >
              {m === 'scroll' ? 'Scroll' : 'Paged'}
            </button>
          ))}
        </div>

        {/* Reader theme control */}
        <div
          className="flex rounded-md overflow-hidden border border-line shrink-0"
          role="group"
          aria-label="Reader theme"
        >
          {READER_THEMES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { onThemeChange(t); }}
              aria-pressed={readerTheme === t}
              className={[
                'font-sans text-xs px-2.5 py-1 transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                readerTheme === t
                  ? 'text-reader-text border-b-2 border-accent font-medium bg-reader-bg'
                  : 'text-reader-text opacity-50 hover:opacity-80 border-b-2 border-transparent bg-reader-bg',
              ].join(' ')}
            >
              {THEME_LABELS[t]}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ReaderPage({ docId, title, onClose }: ReaderPageProps) {
  const { status, pdf, numPages } = usePdfDocument(docId);

  const [mode, setMode] = useState<ReadMode>('scroll');
  const [readerTheme, setReaderTheme] = useState<ReaderThemeName>('paper');
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

  // Compute display width from container (cap at PAGE_MAX_WIDTH)
  const [displayWidth, setDisplayWidth] = useState(Math.min(PAGE_MAX_WIDTH, 600));

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = entry.contentRect.width;
      setDisplayWidth(Math.min(PAGE_MAX_WIDTH, Math.max(280, w - 32)));
    });

    observer.observe(el);
    return () => { observer.disconnect(); };
  }, []);

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
    // data-reader-theme drives the token CSS selectors in theme.css
    <div
      data-reader-theme={readerTheme}
      className="min-h-screen flex flex-col bg-reader-bg text-reader-text"
    >
      <ReaderToolbar
        title={title}
        currentPage={currentPage}
        numPages={numPages}
        mode={mode}
        readerTheme={readerTheme}
        onClose={onClose}
        onModeChange={setMode}
        onThemeChange={setReaderTheme}
      />

      {/* Content area */}
      <div ref={containerRef} className="flex-1 flex flex-col">
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
              />
            ) : (
              <PagedReader
                pdf={pdf}
                numPages={numPages}
                displayWidth={displayWidth}
                currentPage={currentPage}
                onPageChange={(p) => { setCurrentPage(p); scheduleSave(); tracking.onPage(p); }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
