/**
 * use-session-tracking.ts — platform shell hook for reading-session tracking.
 *
 * Owns the 15s heartbeat (active-state-only), AppState cap/resume, unmount
 * close, tz offset capture, and fire-and-forget store.recordSession.
 *
 * All reducer logic is delegated to the pure createSessionTracker seam so the
 * reducer math is independently testable without any React/AppState/timer globals.
 *
 * Pattern mirrors useReadingPosition: stable refs updated in effects (never
 * .current at render), guard ref to open exactly once per docId, swallow all
 * store errors (invariant #1).
 *
 * Device-bound behavior (AppState transitions, heartbeat accrual) is verified in
 * Expo Go — the hook's React-integration layer has no headless test renderer
 * available in this project.
 */

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';

import { useNativeStore } from '../store/store-context.js';

import { type SessionTracker, createSessionTracker } from './session-tracker.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const HEARTBEAT_MS = 15_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UseSessionTrackingArgs {
  docId: string;
  /** True once the PDF is loaded and the WebView has posted 'ready'. */
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
  const { store } = useNativeStore();

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

  // ── Main effect: create tracker, open, start heartbeat, wire AppState ─────────
  useEffect(() => {
    if (!ready) return;
    if (openedForDocRef.current === docId) return; // already opened for this doc
    openedForDocRef.current = docId;

    // Build a fresh tracker for this docId mount
    const tracker = createSessionTracker({
      now: () => Date.now(),
      tzOffset: () => -new Date().getTimezoneOffset(),
      onFlush: (f) => {
        void storeRef.current?.recordSession(f).catch((err: unknown) => {
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

    // Seed initial heartbeat based on current app state
    if (AppState.currentState === 'active') {
      startHeartbeat();
    }

    // ── AppState listener ──────────────────────────────────────────────────────

    function handleAppStateChange(nextState: AppStateStatus): void {
      if (nextState === 'active') {
        tracker.activity(); // credit partial interval since last beat / resume
        startHeartbeat();
      } else {
        // background or inactive: cap the tail at this moment, pause heartbeat
        tracker.activity();
        stopHeartbeat();
      }
    }

    const sub = AppState.addEventListener('change', handleAppStateChange);

    // ── Cleanup: unmount / docId change ───────────────────────────────────────

    return () => {
      tracker.close();
      stopHeartbeat();
      sub.remove();
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
