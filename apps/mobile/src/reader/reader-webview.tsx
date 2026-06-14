/**
 * reader-webview.tsx — WebView wrapper for the pdf.js reader.
 *
 * Owns the WebView ref, posts bridge messages in (load/setMode/setTheme/gotoPage)
 * and parses onMessage events out (ready/page/position/error). The screen stays declarative —
 * all platform glue (ref, postMessage, message parsing) lives here.
 *
 * ASSET-LOADING MECHANISM: `source={{ html }}` with pdf.js inlined as script
 * tags (generated at build time by scripts/bundle-pdfjs.mjs into
 * src/reader/pdf-js-content.ts). The worker is a Blob URL created from the
 * inlined worker string — no file:// URI access needed, works cross-platform
 * on iOS + Android in Expo Go without a custom dev client. See build-reader-html.ts
 * for the full rationale.
 */

import { useEffect, useRef } from 'react';
import type { WebViewMessageEvent } from 'react-native-webview';
import WebView from 'react-native-webview';

import type { PageTextGeometry } from '@ember/core';
import type { ReaderThemeName } from '@ember/tokens';

import { bytesToBase64 } from '../store/base64.js';

import { buildReaderHtml } from './build-reader-html.js';
import { geometryFromBridge } from './page-geometry.js';
import { PDF_JS_SRC, PDF_WORKER_SRC } from './pdf-js-content.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReadMode = 'scroll' | 'paged';

/** Bridge message shapes sent from the WebView to RN. */
export type WebViewInMessage =
  | { type: 'bootReady' }
  | { type: 'ready'; numPages: number }
  | { type: 'page'; current: number }
  | { type: 'position'; page: number; offset: number }
  | { type: 'stage'; stage: string }
  | { type: 'error'; message?: string }
  | { type: 'geometry'; pageNumber: number; viewport: { width: number; height: number }; items: unknown[] }
  | { type: 'selection'; page: number; startChar: number; endChar: number; rect: { x: number; y: number; width: number; height: number } }
  | { type: 'selectionCleared' };

export interface ReaderWebViewProps {
  /**
   * Raw PDF bytes. When provided (not undefined) a `load` message is posted
   * to the WebView. Changing bytes triggers a reload.
   */
  bytes: Uint8Array | undefined;
  mode: ReadMode;
  readerTheme: ReaderThemeName;
  onReady: (numPages: number) => void;
  onPageChange: (page: number) => void;
  onError: (message?: string) => void;
  /** Progress stages from the in-WebView reader (diagnostics + hang watchdog). */
  onStage?: (stage: string) => void;
  /** Called once per page as the page renders; receives normalized geometry from the WebView. */
  onTextGeometry?: (geometry: PageTextGeometry) => void;
  /**
   * Called when the WebView reports the current reading position (scroll capture signal).
   * Debounced by the WebView on scroll-settle (~150 ms). Use this to drive scheduleSave.
   */
  onPosition?: (page: number, offset: number) => void;
  /**
   * One-shot declarative resume command. When this value changes (set once per docId
   * by the screen from onResume), an effect posts { type:'gotoPage', page, offset }
   * to the WebView (gated on bootReady, like the other post effects).
   */
  resumeTo?: { page: number; offset: number } | undefined;
  /**
   * Called when the WebView posts a non-collapsed selection within one page's text
   * layer. Includes raw char offsets (DOM TreeWalker sum) + bounding rect in
   * WebView-viewport CSS px for positioning the native toolbar overlay.
   */
  onSelection?: (s: { page: number; startChar: number; endChar: number; rect: { x: number; y: number; width: number; height: number } }) => void;
  /** Called when the WebView selection collapses or is cleared. */
  onSelectionCleared?: () => void;
  /**
   * RN-resolved paint message; posted to the WebView whenever it changes (gated on
   * bootReady, same pattern as `resumeTo`). Undefined = nothing posted.
   */
  paintMessage?: { type: 'setAnnotations'; items: unknown[] } | undefined;
  /**
   * Increment to ask the WebView to drop its active DOM selection.
   * Mirrors the `resumeTo` declarative-counter pattern: a new value triggers one
   * `clearSelection` post (gated on bootReady).
   */
  clearSelectionSignal?: number;
}

// ── HTML singleton (built once; pdf.js content is ~3MB) ──────────────────────
let cachedHtml: string | null = null;
function getReaderHtml(): string {
  if (cachedHtml === null) {
    cachedHtml = buildReaderHtml(PDF_JS_SRC, PDF_WORKER_SRC);
  }
  return cachedHtml;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ReaderWebView({
  bytes,
  mode,
  readerTheme,
  onReady,
  onPageChange,
  onError,
  onStage,
  onTextGeometry,
  onPosition,
  resumeTo,
  onSelection,
  onSelectionCleared,
  paintMessage,
  clearSelectionSignal,
}: ReaderWebViewProps) {
  const webViewRef = useRef<WebView | null>(null);
  // The in-page pdf.js (~3MB) only attaches its `message` listener after it
  // finishes evaluating; until it posts `bootReady`, RN posts are silently
  // dropped (react-native-webview's postMessage is not queued). So we gate all
  // outbound posts on this and flush the current bytes/mode/theme on bootReady.
  const bootReadyRef = useRef(false);

  function post(message: Record<string, unknown>) {
    webViewRef.current?.postMessage(JSON.stringify(message));
  }

  function postLoad(b: Uint8Array) {
    // Convert Uint8Array → base64 for the bridge (our encoder, no btoa OOM risk)
    post({ type: 'load', bytesBase64: bytesToBase64(b) });
  }

  // Post `load` when bytes arrive or change — only once the WebView is ready.
  // postMessage is inlined (not via the `post` helper) so the effect depends
  // only on `bytes` + the stable ref, satisfying react-hooks/exhaustive-deps.
  useEffect(() => {
    if (bytes === undefined || !bootReadyRef.current) return;
    webViewRef.current?.postMessage(
      JSON.stringify({ type: 'load', bytesBase64: bytesToBase64(bytes) }),
    );
  }, [bytes]);

  // Sync mode changes to the WebView (post-boot only).
  useEffect(() => {
    if (!bootReadyRef.current) return;
    webViewRef.current?.postMessage(JSON.stringify({ type: 'setMode', mode }));
  }, [mode]);

  // Sync theme changes to the WebView (post-boot only).
  useEffect(() => {
    if (!bootReadyRef.current) return;
    webViewRef.current?.postMessage(JSON.stringify({ type: 'setTheme', theme: readerTheme }));
  }, [readerTheme]);

  // Declarative resume: post gotoPage when resumeTo changes (set once per docId from onResume).
  // Gated on bootReady like the other post effects.
  useEffect(() => {
    if (resumeTo === undefined || !bootReadyRef.current) return;
    webViewRef.current?.postMessage(
      JSON.stringify({ type: 'gotoPage', page: resumeTo.page, offset: resumeTo.offset }),
    );
  }, [resumeTo]);

  // Post setAnnotations whenever the resolved paint message changes.
  // Gated on bootReady — mirrors the resumeTo effect exactly.
  useEffect(() => {
    if (paintMessage === undefined || !bootReadyRef.current) return;
    webViewRef.current?.postMessage(JSON.stringify(paintMessage));
  }, [paintMessage]);

  // Post clearSelection when the signal counter increments.
  // Gated on bootReady — mirrors the resumeTo/paintMessage pattern.
  useEffect(() => {
    if (clearSelectionSignal === undefined || clearSelectionSignal === 0 || !bootReadyRef.current) return;
    webViewRef.current?.postMessage(JSON.stringify({ type: 'clearSelection' }));
  }, [clearSelectionSignal]);

  function handleMessage(event: WebViewMessageEvent) {
    let msg: WebViewInMessage;
    try {
      msg = JSON.parse(event.nativeEvent.data) as WebViewInMessage;
    } catch {
      return;
    }
    switch (msg.type) {
      case 'bootReady':
        // The in-page listener is now attached. Flush the desired initial
        // state (mode/theme first so the load renders into the right view).
        bootReadyRef.current = true;
        onStage?.('webview-booted');
        post({ type: 'setMode', mode });
        post({ type: 'setTheme', theme: readerTheme });
        if (bytes !== undefined) postLoad(bytes);
        // Flush pending paint message (annotations already loaded before boot).
        if (paintMessage !== undefined) post(paintMessage as Record<string, unknown>);
        break;
      case 'ready':
        onReady(msg.numPages);
        break;
      case 'page':
        onPageChange(msg.current);
        break;
      case 'position':
        onPosition?.(msg.page, msg.offset);
        break;
      case 'stage':
        onStage?.(msg.stage);
        break;
      case 'error':
        onError(msg.message);
        break;
      case 'geometry':
        // Guard the adapter call so a malformed bridge message can't crash the handler.
        try {
          onTextGeometry?.(geometryFromBridge(msg));
        } catch {
          // Non-fatal: geometry extraction failure must never break rendering.
        }
        break;
      case 'selection':
        onSelection?.(msg);
        break;
      case 'selectionCleared':
        onSelectionCleared?.();
        break;
    }
  }

  return (
    <WebView
      ref={(ref) => { webViewRef.current = ref; }}
      // Self-contained HTML with inlined pdf.js. A real `baseUrl` origin is
      // REQUIRED: ES module scripts (pdf.js v6 is ESM-only) and blob-URL workers
      // do NOT execute from the opaque/about:blank origin that `source={{html}}`
      // defaults to — they're silently skipped, which presents as an infinite
      // spinner. Giving the document a proper origin lets the module + worker run.
      source={{ html: getReaderHtml(), baseUrl: 'https://ember.reader/' }}
      // Allow JS, inline media; disable zoom bouncing on iOS
      javaScriptEnabled
      allowsInlineMediaPlayback
      scrollEnabled
      // Android: allow reading local files (not strictly needed for inline HTML,
      // but kept for future file-stream optimization)
      allowFileAccess
      // Required for postMessage to work on both platforms
      originWhitelist={['*']}
      // Suppress the native text-selection action menu (Copy / Share / Select all).
      // It renders as a system overlay above all app content, covering our own
      // SelectionToolbar. An empty array suppresses it on both iOS and Android while
      // leaving the selection itself (handles + selectionchange) intact — our swatch
      // toolbar becomes the only affordance over a selection.
      menuItems={[]}
      onMessage={handleMessage}
      // Suppress console errors from leaking as yellow boxes in dev
      onError={() => { onError(); }}
      style={{ flex: 1, backgroundColor: 'transparent' }}
      // Android: hardware acceleration for canvas rendering
      androidLayerType="hardware"
    />
  );
}
