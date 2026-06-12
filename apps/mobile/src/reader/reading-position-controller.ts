/**
 * reading-position-controller.ts — pure (no React, no RN) controller for
 * reading-position capture/restore.
 *
 * Logic is extracted here so it can be unit-tested headlessly (Vitest, node
 * environment) without a React renderer or WebView. The thin hook wrapper
 * (use-reading-position.ts) connects this to React state. This mirrors the
 * native-clock / coerceStoredPreference house style: logic pure, deps injected.
 *
 * Responsibilities:
 *   resume(docId) — fetch saved position once per docId; call onResume if found.
 *                   Idempotent per docId. Generation token prevents stale async
 *                   callbacks from firing after a docId change.
 *   scheduleSave(docId) — debounced capture: (re)starts a timer; on fire reads
 *                         getCurrent() and saves. Save errors are swallowed
 *                         (invariant #1 — a failed save must never break reading).
 *   flush(docId) — cancel timer and save immediately (use on unmount / docId change).
 *   dispose()    — clear any pending timer without saving.
 */

import type { ReadingPosition } from '@ember/core';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReadingPositionControllerDeps {
  /** Fetch the stored position for a docId (may return undefined). */
  getPosition: (docId: string) => Promise<ReadingPosition | undefined>;
  /** Persist the current position. Should not throw from the caller's perspective. */
  savePosition: (input: { docId: string; page: number; offset: number }) => Promise<ReadingPosition>;
  /** Returns the latest position reported by the WebView. */
  getCurrent: () => { page: number; offset: number };
  /** Called when resume finds a saved position — tells the WebView to scroll there. */
  onResume: (saved: ReadingPosition) => void;
  /** Debounce window in ms (default 600). */
  debounceMs?: number;
  /** Injected so tests can use fake timers. Default: setTimeout. */
  setTimer?: (fn: () => void, ms: number) => number;
  /** Injected so tests can use fake timers. Default: clearTimeout. */
  clearTimer?: (id: number) => void;
}

export interface ReadingPositionController {
  resume(docId: string): void;
  scheduleSave(docId: string): void;
  flush(docId: string): void;
  dispose(): void;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createReadingPositionController(
  deps: ReadingPositionControllerDeps,
): ReadingPositionController {
  const {
    getPosition,
    savePosition,
    getCurrent,
    onResume,
    debounceMs = 600,
    setTimer = (fn, ms) => setTimeout(fn, ms) as unknown as number,
    clearTimer = (id) => { clearTimeout(id); },
  } = deps;

  // ── Resume state ──
  // Track which docId we have already resumed (or started resuming) to make
  // resume() idempotent per docId. A generation counter lets us detect stale
  // in-flight getPosition callbacks that arrive after a docId change.
  let resumedDocId: string | null = null;
  let generation = 0;

  // ── Debounce state ──
  let timerId: number | null = null;

  return {
    resume(docId: string): void {
      // Idempotent per docId — if we already started or completed a resume for
      // this docId, do nothing.
      if (resumedDocId === docId) return;

      resumedDocId = docId;
      const myGen = ++generation;

      void (async () => {
        let saved: ReadingPosition | undefined;
        try {
          saved = await getPosition(docId);
        } catch {
          // getPosition failing must never break reading (invariant #1)
          return;
        }

        // Guard: if docId changed while we were waiting, discard this result.
        if (generation !== myGen) return;

        if (saved !== undefined) {
          onResume(saved);
        }
      })();
    },

    scheduleSave(docId: string): void {
      // Cancel any existing pending timer (re-debounce on each call)
      if (timerId !== null) {
        clearTimer(timerId);
        timerId = null;
      }

      timerId = setTimer(() => {
        timerId = null;
        const current = getCurrent();
        void savePosition({ docId, ...current }).catch(() => {
          // Swallow save errors — invariant #1: a failed save must never break reading.
        });
      }, debounceMs);
    },

    flush(docId: string): void {
      if (timerId === null) return;

      // Cancel the pending timer
      clearTimer(timerId);
      timerId = null;

      // Save immediately
      const current = getCurrent();
      void savePosition({ docId, ...current }).catch(() => {
        // Swallow — same invariant as scheduleSave
      });
    },

    dispose(): void {
      if (timerId !== null) {
        clearTimer(timerId);
        timerId = null;
      }
    },
  };
}
