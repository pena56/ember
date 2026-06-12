/**
 * use-reading-position.ts — thin React hook over ReadingPositionController.
 *
 * Wires the pure controller (reading-position-controller.ts) to React state,
 * the NativeStore, and the component's props. The controller is built once
 * (stored in a ref) so it persists across renders without restarting the
 * debounce timer.
 *
 * Device-bound behavior (scroll restore accuracy) is verified in Expo Go, not
 * unit-tested here — the hook's React-integration layer has no headless test
 * renderer available in this project.
 */

import { useEffect, useRef } from 'react';

import type { ReadingPosition } from '@ember/core';

import { useNativeStore } from '../store/store-context.js';

import { createReadingPositionController } from './reading-position-controller.js';
import type { ReadingPositionController } from './reading-position-controller.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UseReadingPositionArgs {
  docId: string;
  /** true once the WebView has posted 'ready' — resume fires only after this. */
  ready: boolean;
  /** Returns the latest position reported by the WebView (via latestPosRef). */
  getCurrent: () => { page: number; offset: number };
  /** Called when the controller finds a saved position to restore. */
  onResume: (saved: ReadingPosition) => void;
}

export interface UseReadingPositionResult {
  /** Call from onPosition to debounce-save the current position. */
  scheduleSave: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useReadingPosition({
  docId,
  ready,
  getCurrent,
  onResume,
}: UseReadingPositionArgs): UseReadingPositionResult {
  const { store } = useNativeStore();

  // Box the latest callbacks so the controller sees current closures without
  // needing to rebuild. We update these in effects (not render) to satisfy
  // react-hooks/refs which disallows .current access during render.
  const getPositionRef = useRef<(id: string) => Promise<ReadingPosition | undefined>>(
    (_id) => Promise.resolve(undefined),
  );
  const savePositionRef = useRef<
    (input: { docId: string; page: number; offset: number }) => Promise<ReadingPosition>
  >(
    (input) =>
      Promise.resolve({ id: input.docId, page: input.page, offset: input.offset, updatedAt: '' }),
  );
  const getCurrentRef = useRef(getCurrent);
  const onResumeRef = useRef(onResume);

  // Update callback refs in effects so they stay current without causing
  // re-renders and without touching .current at render time.
  useEffect(() => {
    getCurrentRef.current = getCurrent;
  }, [getCurrent]);

  useEffect(() => {
    onResumeRef.current = onResume;
  }, [onResume]);

  useEffect(() => {
    getPositionRef.current = store
      ? (id) => store.getReadingPosition(id)
      : (_id) => Promise.resolve(undefined);
    savePositionRef.current = store
      ? (input) => store.saveReadingPosition(input)
      : (input) =>
          Promise.resolve({ id: input.docId, page: input.page, offset: input.offset, updatedAt: '' });
  }, [store]);

  // Build the controller once on mount and hold it for the component lifetime.
  const controllerRef = useRef<ReadingPositionController | null>(null);

  useEffect(() => {
    const ctrl = createReadingPositionController({
      getPosition: (id) => getPositionRef.current(id),
      savePosition: (input) => savePositionRef.current(input),
      getCurrent: () => getCurrentRef.current(),
      onResume: (saved) => { onResumeRef.current(saved); },
    });
    controllerRef.current = ctrl;

    return () => {
      ctrl.dispose();
      controllerRef.current = null;
    };
  }, []);

  // Track the previous docId to flush on change.
  const prevDocIdRef = useRef<string>(docId);

  // On docId change: flush the old doc's position before switching.
  useEffect(() => {
    const prev = prevDocIdRef.current;
    if (prev !== docId) {
      controllerRef.current?.flush(prev);
      prevDocIdRef.current = docId;
    }
  }, [docId]);

  // When ready flips true → resume for the current docId.
  useEffect(() => {
    if (!ready) return;
    controllerRef.current?.resume(docId);
  }, [docId, ready]);

  // Flush on unmount (the controller.dispose() in the mount effect cancels the
  // timer without saving; we flush here so the last position is persisted).
  useEffect(() => {
    return () => {
      controllerRef.current?.flush(prevDocIdRef.current);
    };
  }, []);

  return {
    scheduleSave: () => { controllerRef.current?.scheduleSave(docId); },
  };
}
