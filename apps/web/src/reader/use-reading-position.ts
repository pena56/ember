/**
 * use-reading-position.ts — encapsulates load-on-open + debounced last-write save.
 *
 * Resume contract:
 *   - When `ready` flips true, fetch the stored position for `docId`.
 *   - If found, call `onResume(saved)` exactly once per docId mount.
 *   - Guard with a cancel flag + a ref so it fires exactly once per docId.
 *
 * Save contract:
 *   - `scheduleSave()` debounces (~600 ms) then reads `getCurrent()` and persists.
 *   - Flush/cancel the pending timer on unmount and on docId change.
 *   - Swallow/log save errors — a failed save must never break reading (invariant #1).
 */

import { useCallback, useEffect, useRef } from 'react';

import type { ReadingPosition } from '@ember/core';

import { useWebStore } from '../store/store-context.js';

const DEBOUNCE_MS = 600;

export interface UseReadingPositionArgs {
  docId: string;
  /** True once the PDF is loaded and pages are measurable. */
  ready: boolean;
  /** Read the current scroll position (called inside the debounce callback). */
  getCurrent: () => { page: number; offset: number };
  /** Called once per docId when a saved position is found. */
  onResume: (saved: ReadingPosition) => void;
}

export interface UseReadingPositionResult {
  /** Schedule a debounced save of the current reading position. */
  scheduleSave: () => void;
}

export function useReadingPosition({
  docId,
  ready,
  getCurrent,
  onResume,
}: UseReadingPositionArgs): UseReadingPositionResult {
  const store = useWebStore();

  // Ref so we fire onResume exactly once per docId
  const resumedForDocRef = useRef<string | null>(null);

  // Ref to hold the pending debounce timer id
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable refs so the debounce callback always sees fresh values without
  // causing re-renders or stale closures. Updated via useEffect (not during render)
  // to satisfy the react-hooks/refs lint rule.
  const getCurrentRef = useRef(getCurrent);
  const onResumeRef = useRef(onResume);

  useEffect(() => {
    getCurrentRef.current = getCurrent;
  }, [getCurrent]);

  useEffect(() => {
    onResumeRef.current = onResume;
  }, [onResume]);

  // ── Resume: once per docId after ready ──────────────────────────────────────
  useEffect(() => {
    if (!ready) return;
    if (resumedForDocRef.current === docId) return; // already resumed for this doc
    resumedForDocRef.current = docId;

    let cancelled = false;

    async function doResume() {
      try {
        const saved = await store.getReadingPosition(docId);
        if (!cancelled && saved !== undefined) {
          onResumeRef.current(saved);
        }
      } catch {
        // Swallow — a failed read must not break reading (invariant #1)
      }
    }

    void doResume();

    return () => {
      cancelled = true;
    };
  }, [docId, ready, store]);

  // ── Flush timer on docId change or unmount ───────────────────────────────────
  // Flush (not just cancel) so a position captured moments before navigating
  // back/away isn't lost. The cleanup runs while the old mount's refs are still
  // current, so getCurrent()/docId refer to the doc being left.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        const { page, offset } = getCurrentRef.current();
        store.saveReadingPosition({ docId, page, offset }).catch((err: unknown) => {
          // Swallow — save errors must never break reading (invariant #1)
          console.warn('[useReadingPosition] flush save error (swallowed):', err);
        });
      }
      // Reset resume guard when docId changes so the next doc re-arms
      resumedForDocRef.current = null;
    };
  }, [docId, store]);

  // ── scheduleSave ─────────────────────────────────────────────────────────────
  const scheduleSave = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const { page, offset } = getCurrentRef.current();
      store.saveReadingPosition({ docId, page, offset }).catch((err: unknown) => {
        // Swallow — save errors must never break reading (invariant #1)
        console.warn('[useReadingPosition] save error (swallowed):', err);
      });
    }, DEBOUNCE_MS);
  }, [docId, store]);

  return { scheduleSave };
}
