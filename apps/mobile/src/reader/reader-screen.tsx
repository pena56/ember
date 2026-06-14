/**
 * reader-screen.tsx — the full-screen PDF reader screen.
 *
 * Composes:
 *  - Native toolbar (app-chrome tokens: bg-surface / text-text / border-line)
 *  - ReaderWebView content area
 *  - Loading / error / missing states (warm DocumentNotice voice + EmberFlame motif)
 *
 * Reader theme (paper/sepia/night) and mode (scroll/paged) are local state,
 * default scroll + paper, NOT persisted (matches 05a). Reading-position
 * capture/restore (resume where you left off) is wired here via
 * useReadingPosition (unit 06d).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ColorValue } from 'react-native';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useResolveClassNames } from 'uniwind';

import type { Annotation, HighlightColor, PageTextGeometry, ReadingPosition, TextAnchor } from '@ember/core';
import type { ReaderThemeName } from '@ember/tokens';

import { EmberFlame } from '../library/ember-flame.js';
import { useNativeStore } from '../store/store-context.js';

import { anchorFromSelection } from './annotation-anchor.js';
import { AnnotationEditor } from './annotation-editor.js';
import { buildSetAnnotationsMessage } from './highlight-paint.js';
import type { ReadMode } from './reader-webview.js';
import { ReaderWebView } from './reader-webview.js';
import { SelectionToolbar } from './selection-toolbar.js';
import { useAnnotations } from './use-annotations.js';
import { useCapturePageCount } from './use-capture-page-count.js';
import { useReadingPosition } from './use-reading-position.js';
import { useSessionTracking } from './use-session-tracking.js';

// ── Types ─────────────────────────────────────────────────────────────────────

type LoadStatus = 'loading' | 'ready' | 'error' | 'missing';

export interface ReaderScreenProps {
  docId: string;
  title: string;
  onBack: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const READER_THEMES: ReaderThemeName[] = ['paper', 'sepia', 'night'];
const THEME_LABELS: Record<ReaderThemeName, string> = {
  paper: 'Paper',
  sepia: 'Sepia',
  night: 'Night',
};

const READ_MODES: { value: ReadMode; label: string }[] = [
  { value: 'scroll', label: 'Scroll' },
  { value: 'paged', label: 'Paged' },
];

// Approx. rendered width of the SelectionToolbar (px): 4×36 swatches + 1 divider +
// 1×36 Note button + 5×8 gaps + 2×12 padding + border. Used to center + clamp it.
const TOOLBAR_WIDTH = 248;
const TOOLBAR_MARGIN = 8;
// Approx. rendered width of the AnnotationEditor card (px) — wider than the toolbar
// to fit the note field comfortably; clamped within the overlay the same way.
const EDITOR_WIDTH = 280;

// ── Document Notice (error / missing) ─────────────────────────────────────────

function DocumentNotice({
  kind,
  detailOverride,
  onBack,
}: {
  kind: 'error' | 'missing';
  /** When present, replaces the generic detail (e.g. the WebView failure reason). */
  detailOverride?: string | undefined;
  onBack: () => void;
}) {
  const message =
    kind === 'missing'
      ? 'This document is no longer in your library.'
      : 'Something went quiet while opening this document.';

  const detail =
    detailOverride ??
    (kind === 'missing'
      ? 'The file may have been removed from your device.'
      : 'The file may be corrupted or in an unsupported format.');

  return (
    <View
      className="flex-1 items-center justify-center gap-6 px-8"
      accessibilityRole="alert"
    >
      {/* Brand flame, dimmed */}
      <View
        className="opacity-30"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <EmberFlame size={48} />
      </View>

      <View className="items-center gap-2 max-w-xs">
        <Text className="font-serif text-lg text-text text-center leading-snug">
          {message}
        </Text>
        <Text className="font-sans text-sm text-text-muted text-center opacity-70">
          {detail}
        </Text>
      </View>

      <Pressable
        onPress={onBack}
        className="mt-2 px-5 py-2.5 rounded-md bg-accent"
        accessibilityRole="button"
        accessibilityLabel="Back to Library"
        style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
      >
        <Text className="font-sans text-sm font-medium text-on-accent">
          Back to Library
        </Text>
      </Pressable>
    </View>
  );
}

// ── Segmented control (mode toggle + theme selector) ─────────────────────────

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  getLabel,
  accessibilityLabel,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  getLabel: (v: T) => string;
  accessibilityLabel: string;
}) {
  return (
    <View
      className="flex-row rounded-md border border-line overflow-hidden bg-surface-raised"
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((opt) => {
        const isActive = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => { onChange(opt); }}
            className={
              isActive
                ? 'px-3 py-1.5 border-b-2 border-accent'
                : 'px-3 py-1.5 border-b-2 border-transparent'
            }
            accessibilityRole="radio"
            accessibilityState={{ checked: isActive }}
            accessibilityLabel={getLabel(opt)}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text
              className={
                isActive
                  ? 'font-sans text-xs text-text font-medium'
                  : 'font-sans text-xs text-text-muted'
              }
            >
              {getLabel(opt)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Reader Toolbar (native, app-chrome tokens) ────────────────────────────────

function ReaderToolbar({
  title,
  currentPage,
  numPages,
  mode,
  readerTheme,
  onBack,
  onModeChange,
  onThemeChange,
}: {
  title: string;
  currentPage: number;
  numPages: number;
  mode: ReadMode;
  readerTheme: ReaderThemeName;
  onBack: () => void;
  onModeChange: (m: ReadMode) => void;
  onThemeChange: (t: ReaderThemeName) => void;
}) {
  return (
    <View className="bg-surface border-b border-line px-3 pt-2 pb-2 gap-2">
      {/* Row 1: back + title + page indicator */}
      <View className="flex-row items-center gap-2">
        {/* Back chevron */}
        <Pressable
          onPress={onBack}
          className="shrink-0 p-1.5 rounded"
          accessibilityRole="button"
          accessibilityLabel="Back to Library"
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
        >
          {/* Chevron left (≈ 18px) */}
          <Text className="font-sans text-lg text-text leading-none">‹</Text>
        </Pressable>

        {/* Document title */}
        <Text
          className="flex-1 font-serif text-base text-text leading-snug"
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {title}
        </Text>

        {/* Page indicator — live region only in paged mode (matches 05a a11y fix) */}
        {numPages > 0 && (
          <Text
            className="font-sans text-xs text-text-muted shrink-0"
            // Announce page turns only in paged mode; scroll would spam the region
            accessibilityLiveRegion={mode === 'paged' ? 'polite' : 'none'}
            accessibilityLabel={`page ${currentPage.toString()} of ${numPages.toString()}`}
          >
            {`${currentPage.toString()} / ${numPages.toString()}`}
          </Text>
        )}
      </View>

      {/* Row 2: mode + theme controls */}
      <View className="flex-row items-center gap-2 flex-wrap">
        <SegmentedControl
          options={READ_MODES.map((m) => m.value)}
          value={mode}
          onChange={onModeChange}
          getLabel={(v) => READ_MODES.find((m) => m.value === v)?.label ?? v}
          accessibilityLabel="Reading mode"
        />
        <SegmentedControl
          options={READER_THEMES}
          value={readerTheme}
          onChange={onThemeChange}
          getLabel={(v) => THEME_LABELS[v]}
          accessibilityLabel="Reader theme"
        />
      </View>
    </View>
  );
}

// ── ReaderScreen ──────────────────────────────────────────────────────────────

export function ReaderScreen({ docId, title, onBack }: ReaderScreenProps) {
  const { store } = useNativeStore();

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [bytes, setBytes] = useState<Uint8Array | undefined>(undefined);
  const [mode, setMode] = useState<ReadMode>('scroll');
  const [readerTheme, setReaderTheme] = useState<ReaderThemeName>('paper');
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  // Diagnostic detail shown under the error notice (e.g. the WebView's failure
  // reason or the last stage reached on a timeout). Surfaced so a device-only
  // failure is reportable instead of an opaque infinite spinner.
  const [errorDetail, setErrorDetail] = useState<string | undefined>(undefined);
  // One-shot resume target: set from onResume, passed to <ReaderWebView resumeTo=…/>
  const [resumeTo, setResumeTo] = useState<{ page: number; offset: number } | undefined>(undefined);

  // ── 10d/10e: Annotations + highlight/note state ───────────────────────────
  const { annotations, createHighlight, createNote, updateAnnotation, removeAnnotation } = useAnnotations(docId);
  // Per-page geometry collected from the WebView as pages render.
  const [geometryByPage, setGeometryByPage] = useState<Map<number, PageTextGeometry>>(new Map());
  // Active text selection: derived TextAnchor + raw viewport rect for toolbar placement.
  const [selection, setSelection] = useState<{
    anchor: TextAnchor;
    rect: { x: number; y: number; width: number; height: number };
  } | null>(null);
  // Counter incremented each time we want the WebView to clear its DOM selection.
  const [clearSelectionSignal, setClearSelectionSignal] = useState(0);
  // 10e: the annotation currently open in the editor card. `isDraft` marks a
  // freshly-created, not-yet-persisted note (first Save persists; empty discards).
  const [editing, setEditing] = useState<{
    annotation: Annotation;
    rect: { x: number; y: number; width: number; height: number };
    isDraft?: boolean;
  } | null>(null);
  // Width of the WebView overlay area (px), measured on layout. Used to clamp the
  // selection toolbar so it never overflows the right edge near a right-margin selection.
  const [overlayWidth, setOverlayWidth] = useState(0);

  // Cancel guard — track the active load so stale async ops don't update state
  const loadIdRef = useRef(0);
  // Last progress stage the WebView reported, for the hang watchdog's message.
  const lastStageRef = useRef<string>('mount');
  // Latest position reported by the WebView capture signal (scroll/paged)
  const latestPosRef = useRef<{ page: number; offset: number }>({ page: 1, offset: 0 });
  // Current page ref — kept in sync with setCurrentPage so getPage() reads the live page.
  const currentPageRef = useRef(1);

  // onResume: called by the controller when a saved position is found. Sets the
  // toolbar page indicator and triggers the one-shot declarative resumeTo prop.
  // useCallback so the ref inside useReadingPosition sees a stable identity.
  const onResume = useCallback(
    (saved: ReadingPosition) => {
      setCurrentPage(saved.page);
      setResumeTo({ page: saved.page, offset: saved.offset });
    },
    [],
  );

  const { scheduleSave } = useReadingPosition({
    docId,
    ready: status === 'ready',
    getCurrent: () => latestPosRef.current,
    onResume,
  });

  const tracking = useSessionTracking({
    docId,
    ready: status === 'ready',
    getPage: () => currentPageRef.current,
  });

  useCapturePageCount({ docId, ready: status === 'ready', numPages });

  // Memoized paint message: recomputed when annotations or geometry changes.
  // Passed to <ReaderWebView> which posts it into the WebView on change (gated on bootReady).
  const paintMessage = useMemo(
    () => buildSetAnnotationsMessage(annotations, geometryByPage),
    [annotations, geometryByPage],
  );

  const accent = useResolveClassNames('bg-accent').backgroundColor as ColorValue;

  // Load bytes from the store
  useEffect(() => {
    if (!store) return;

    const loadId = ++loadIdRef.current;
    lastStageRef.current = 'fetching-bytes';

    void (async () => {
      // Resets live inside the async body (not synchronously in the effect) to
      // avoid react-hooks' set-state-in-effect cascade warning — mirrors web's
      // use-pdf-document load() pattern.
      setStatus('loading');
      setBytes(undefined);
      setCurrentPage(1);
      setNumPages(0);
      setErrorDetail(undefined);
      setResumeTo(undefined);
      latestPosRef.current = { page: 1, offset: 0 };
      try {
        const result = await store.getPdfBytes(docId);
        if (loadId !== loadIdRef.current) return; // stale

        if (result === undefined) {
          setStatus('missing');
        } else {
          setBytes(result);
          // Status transitions to 'ready' when WebView posts 'ready' message
        }
      } catch {
        if (loadId !== loadIdRef.current) return;
        setStatus('error');
        setErrorDetail('Could not read the file from storage.');
      }
    })();
  }, [store, docId]);

  // Hang watchdog: the WebView render is device-only and can stall silently
  // (e.g. a blocked pdf.js worker). If no 'ready'/'error' arrives within the
  // window after bytes are posted, surface an error with the last stage reached
  // rather than spinning forever.
  useEffect(() => {
    if (status !== 'loading' || bytes === undefined) return;
    const timer = setTimeout(() => {
      setStatus('error');
      setErrorDetail(`Timed out while rendering (last step: ${lastStageRef.current}).`);
    }, 25000);
    return () => { clearTimeout(timer); };
  }, [status, bytes]);

  function handleWebViewReady(n: number) {
    setNumPages(n);
    setStatus('ready');
    setCurrentPage(1);
  }

  function handlePageChange(page: number) {
    setCurrentPage(page);
    currentPageRef.current = page;
    tracking.onPage(page);
  }

  function handlePosition(page: number, offset: number) {
    // Update the latest position ref (getCurrent reads this) and trigger a
    // debounced save. The toolbar indicator is driven by handlePageChange (the
    // 'page' signal), not this — they're separate bridge signals.
    latestPosRef.current = { page, offset };
    scheduleSave();
    tracking.onActivity();
  }

  function handleWebViewStage(stage: string) {
    lastStageRef.current = stage;
  }

  function handleWebViewError(message?: string) {
    setStatus('error');
    if (message !== undefined) setErrorDetail(message);
  }

  // ── 10d: Geometry + selection handlers ────────────────────────────────────

  function handleTextGeometry(geometry: PageTextGeometry) {
    setGeometryByPage((prev) => {
      const next = new Map(prev);
      next.set(geometry.pageNumber, geometry);
      return next;
    });
  }

  function handleSelection(s: { page: number; startChar: number; endChar: number; rect: { x: number; y: number; width: number; height: number } }) {
    const geometry = geometryByPage.get(s.page);
    if (!geometry) return; // geometry not yet received for this page — ignore
    const anchor = anchorFromSelection({
      page: s.page,
      startChar: s.startChar,
      endChar: s.endChar,
      geometry,
    });
    if (anchor !== null) {
      setSelection({ anchor, rect: s.rect });
    }
  }

  function handleSelectionCleared() {
    setSelection(null);
  }

  function handleSwatchPick(color: Parameters<typeof createHighlight>[0]['color']) {
    if (!selection) return;
    const { anchor } = selection;
    setSelection(null);
    // Ask the WebView to drop its DOM selection before the highlight is painted.
    setClearSelectionSignal((n) => n + 1);
    void createHighlight({ anchor, color });
  }

  // ── 10e: edit/note handlers ───────────────────────────────────────────────

  // Tap on a painted highlight or note pin/underline — open the editor on the
  // matching record at the tapped rect. Unknown ids are ignored (stale paint).
  function handleAnnotationTap({ id, rect }: { id: string; rect: { x: number; y: number; width: number; height: number } }) {
    const found = annotations.find((a) => a.id === id);
    if (!found) return;
    setEditing({ annotation: found, rect });
  }

  // Note toolbar button — open an unsaved draft note editor (mirror web 10c).
  // Nothing is written until the first Save; closing empty discards (10a forbids
  // empty note-kind text). The draft is a local Annotation-shaped object.
  function handleAddNote() {
    if (!selection) return;
    const { anchor, rect } = selection;
    const draft: Annotation = {
      id: `draft-${Date.now().toString()}`,
      docId,
      kind: 'note',
      anchor,
      note: '',
      createdAt: Date.now(),
      updatedAt: '',
    };
    setSelection(null);
    setClearSelectionSignal((n) => n + 1);
    setEditing({ annotation: draft, rect, isDraft: true });
  }

  function handleRecolor(color: HighlightColor) {
    if (!editing) return;
    const { annotation } = editing;
    void updateAnnotation({ annotation, patch: { color } });
    setEditing(null);
  }

  function handleEditNote(textValue: string) {
    if (!editing) return;
    const { annotation, rect, isDraft } = editing;
    const trimmed = textValue.trim();
    if (isDraft) {
      // First Save for a draft note — persist now (empty already guarded by the editor).
      if (trimmed === '') { setEditing(null); return; }
      void createNote({ anchor: annotation.anchor, note: trimmed }).then((created) => {
        // Swap the editor to the persisted record so a follow-up edit/delete works.
        if (created) setEditing({ annotation: created, rect });
        else setEditing(null);
      });
    } else {
      // Empty string clears a highlight's note (10a); note-kind can't go empty here.
      void updateAnnotation({ annotation, patch: { note: trimmed === '' ? null : trimmed } });
      setEditing(null);
    }
  }

  function handleDeleteAnnotation() {
    if (!editing) return;
    const { annotation, isDraft } = editing;
    // A draft was never written — just discard.
    if (!isDraft) void removeAnnotation(annotation.id);
    setEditing(null);
  }

  return (
    <View className="flex-1 bg-surface">
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {/* Native toolbar — app-chrome tokens (bg-surface / text-text / border-line) */}
        <ReaderToolbar
          title={title}
          currentPage={currentPage}
          numPages={numPages}
          mode={mode}
          readerTheme={readerTheme}
          onBack={onBack}
          onModeChange={setMode}
          onThemeChange={setReaderTheme}
        />

        {/* Content area */}
        <View className="flex-1">
          {/* Loading state */}
          {status === 'loading' && (
            <View
              className="flex-1 items-center justify-center"
              accessibilityRole="none"
              accessibilityState={{ busy: true }}
              accessibilityLabel="Opening document"
            >
              <ActivityIndicator
                size="large"
                color={accent}
                accessibilityElementsHidden
              />
            </View>
          )}

          {/* Error / missing notice */}
          {(status === 'error' || status === 'missing') && (
            <DocumentNotice kind={status} detailOverride={errorDetail} onBack={onBack} />
          )}

          {/* WebView — always mounted when bytes are available so it can
              receive the load message; hidden behind loading until ready */}
          {bytes !== undefined && (
            <View
              onLayout={(e) => { setOverlayWidth(e.nativeEvent.layout.width); }}
              style={{
                flex: 1,
                // Keep the WebView mounted but invisible while status === 'loading'
                // so it receives the load postMessage; once 'ready' or 'error' it
                // becomes fully visible or hidden
                opacity: status === 'ready' ? 1 : 0,
                // When error state kicks in (WebView posts 'error'), collapse it
                display: status === 'error' || status === 'missing' ? 'none' : 'flex',
              }}
            >
              <ReaderWebView
                bytes={bytes}
                mode={mode}
                readerTheme={readerTheme}
                onReady={handleWebViewReady}
                onPageChange={handlePageChange}
                onError={handleWebViewError}
                onStage={handleWebViewStage}
                onPosition={handlePosition}
                resumeTo={resumeTo}
                onTextGeometry={handleTextGeometry}
                onSelection={handleSelection}
                onSelectionCleared={handleSelectionCleared}
                onAnnotationTap={handleAnnotationTap}
                paintMessage={paintMessage}
                clearSelectionSignal={clearSelectionSignal}
              />

              {/* Native selection toolbar — absolutely positioned over the WebView
                  at the selection's bounding rect. Placed above the rect when there
                  is room; falls back to below near the top edge. */}
              {selection !== null && editing === null && (
                <SelectionToolbar
                  onPick={handleSwatchPick}
                  onAddNote={handleAddNote}
                  style={{
                    position: 'absolute',
                    // Place the toolbar above the selection rect; fall back to below
                    // if the rect is near the top edge (< 60 px room).
                    top: selection.rect.y > 60
                      ? selection.rect.y - 56
                      : selection.rect.y + selection.rect.height + 8,
                    // Horizontally centered on the rect, clamped within the overlay
                    // width so it never overflows the left or right edge.
                    left: Math.min(
                      Math.max(TOOLBAR_MARGIN, selection.rect.x + selection.rect.width / 2 - TOOLBAR_WIDTH / 2),
                      Math.max(TOOLBAR_MARGIN, overlayWidth - TOOLBAR_WIDTH - TOOLBAR_MARGIN),
                    ),
                  }}
                />
              )}

              {/* Native annotation editor — absolutely positioned over the WebView at
                  the tapped annotation rect. Same placement/clamp math as the toolbar. */}
              {editing !== null && (
                <AnnotationEditor
                  annotation={editing.annotation}
                  isDraft={editing.isDraft}
                  onRecolor={handleRecolor}
                  onEditNote={handleEditNote}
                  onDelete={handleDeleteAnnotation}
                  onClose={() => { setEditing(null); }}
                  style={{
                    position: 'absolute',
                    // Below the rect when there's room above; otherwise above it.
                    top: editing.rect.y > 200
                      ? editing.rect.y - 8
                      : editing.rect.y + editing.rect.height + 8,
                    left: Math.min(
                      Math.max(TOOLBAR_MARGIN, editing.rect.x + editing.rect.width / 2 - EDITOR_WIDTH / 2),
                      Math.max(TOOLBAR_MARGIN, overlayWidth - EDITOR_WIDTH - TOOLBAR_MARGIN),
                    ),
                    width: EDITOR_WIDTH,
                  }}
                />
              )}
            </View>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
