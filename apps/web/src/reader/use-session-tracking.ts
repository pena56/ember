/**
 * use-session-tracking.ts — platform shell hook for reading-session tracking.
 *
 * Owns the 15s heartbeat (visible-only), visibilitychange cap/resume, pagehide +
 * unmount close, tz offset capture, and fire-and-forget store.recordSession.
 *
 * All reducer logic is delegated to the pure createSessionTracker seam so the
 * reducer math is independently testable without any React/DOM/timer globals.
 *
 * Pattern mirrors useReadingPosition: stable refs updated in effects, guard ref
 * to open exactly once per docId, swallow all store errors (invariant #1).
 */

import { useEffect, useRef } from 'react';

import { useWebStore } from '../store/store-context.js';

import { type SessionTracker, createSessionTracker } from './session-tracker.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const HEARTBEAT_MS = 15_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UseSessionTrackingArgs {
  docId: string;
  /** True once the PDF is loaded and pages are measurable. */
  ready: boolean;
  /** Read the current page number (called at open time). */
  getPage: () => number;
}

export interface UseSessionTrackingResult {
  /** Notify the tracker of user scroll/interaction activity. */
  onActivity: () => void;
  /** Notify the tracker of an explicit page turn. */
  onPage: (page: number) => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSessionTracking({
  docId,
  ready,
  getPage,
}: UseSessionTrackingArgs): UseSessionTrackingResult {
  const store = useWebStore();

  // Guard: open exactly once per docId mount (mirrors useReadingPosition's resume-once pattern)
  const openedForDocRef = useRef<string | null>(null);

  // Heartbeat interval id ref
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tracker ref — one tracker per docId mount
  const trackerRef = useRef<SessionTracker | null>(null);

  // Stable refs so effects always see the latest values without causing re-renders
  const getPageRef = useRef(getPage);
  const storeRef = useRef(store);

  useEffect(() => {
    getPageRef.current = getPage;
  }, [getPage]);

  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  // ── Main effect: create tracker, open, start heartbeat, wire listeners ────────
  useEffect(() => {
    if (!ready) return;
    if (openedForDocRef.current === docId) return; // already opened for this doc
    openedForDocRef.current = docId;

    // Build a fresh tracker for this docId mount
    const tracker = createSessionTracker({
      now: () => Date.now(),
      tzOffset: () => -new Date().getTimezoneOffset(),
      onFlush: (f) => {
        void storeRef.current.recordSession(f).catch((err: unknown) => {
          console.warn('[useSessionTracking] recordSession error (swallowed):', err);
        });
      },
    });
    trackerRef.current = tracker;

    // Open the initial bout
    tracker.open(docId, getPageRef.current());

    // ── Heartbeat helpers ──────────────────────────────────────────────────────

    function startHeartbeat(): void {
      if (heartbeatRef.current !== null) return; // already running
      heartbeatRef.current = setInterval(() => {
        tracker.activity();
      }, HEARTBEAT_MS);
    }

    function stopHeartbeat(): void {
      if (heartbeatRef.current !== null) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    }

    // Start heartbeat immediately (tab is presumably visible)
    if (document.visibilityState === 'visible') {
      startHeartbeat();
    }

    // ── Visibility listener ────────────────────────────────────────────────────

    function handleVisibilityChange(): void {
      if (document.visibilityState === 'hidden') {
        tracker.activity(); // cap the tail at hide moment
        stopHeartbeat();
      } else {
        tracker.activity(); // credit partial interval since last beat
        startHeartbeat();
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // ── pagehide listener (tab close / bfcache) ────────────────────────────────

    function handlePageHide(): void {
      tracker.close();
    }

    window.addEventListener('pagehide', handlePageHide);

    // ── Cleanup: unmount / docId change ───────────────────────────────────────

    return () => {
      tracker.close();
      stopHeartbeat();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      // Reset guard so the next doc re-arms
      openedForDocRef.current = null;
      trackerRef.current = null;
    };
  }, [docId, ready]);

  // ── Stable return values ───────────────────────────────────────────────────

  return {
    onActivity(): void {
      trackerRef.current?.activity();
    },
    onPage(page: number): void {
      trackerRef.current?.page(page);
    },
  };
}
