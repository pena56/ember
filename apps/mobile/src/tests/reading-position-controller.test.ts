/**
 * reading-position-controller.test.ts — pure headless tests for the reading
 * position controller. All deps are injected (fake timers, spy functions) so
 * no React/RN/WebView is needed. Pixel-accurate scroll restore is device-verified.
 */

import { describe, expect, it, vi } from 'vitest';

import type { ReadingPosition } from '@ember/core';

import { createReadingPositionController } from '../reader/reading-position-controller.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePosition(page: number, offset = 0): ReadingPosition {
  return { id: 'doc-1', page, offset, updatedAt: '0' };
}

/** Fake timer pair: tick() advances all scheduled timers by ms. */
function makeFakeTimers() {
  let seq = 0;
  const pending = new Map<number, { ms: number; fn: () => void; elapsed: number }>();

  const setTimer = (fn: () => void, ms: number): number => {
    const id = ++seq;
    pending.set(id, { ms, fn, elapsed: 0 });
    return id;
  };

  const clearTimer = (id: number) => {
    pending.delete(id);
  };

  /** Advance time by `ms`; fire timers whose accumulated elapsed >= their ms. */
  const tick = (ms: number) => {
    for (const [id, entry] of pending) {
      entry.elapsed += ms;
      if (entry.elapsed >= entry.ms) {
        pending.delete(id);
        entry.fn();
      }
    }
  };

  return { setTimer, clearTimer, tick };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createReadingPositionController', () => {
  describe('resume', () => {
    it('calls onResume once with the stored position', async () => {
      const saved = makePosition(7, 0.3);
      const getPosition = vi.fn().mockResolvedValue(saved);
      const savePosition = vi.fn().mockResolvedValue(saved);
      const getCurrent = vi.fn().mockReturnValue({ page: 1, offset: 0 });
      const onResume = vi.fn();
      const timers = makeFakeTimers();

      const ctrl = createReadingPositionController({
        getPosition,
        savePosition,
        getCurrent,
        onResume,
        debounceMs: 600,
        setTimer: timers.setTimer,
        clearTimer: timers.clearTimer,
      });

      ctrl.resume('doc-1');
      // Let the async getPosition resolve
      await Promise.resolve();
      await Promise.resolve();

      expect(onResume).toHaveBeenCalledOnce();
      expect(onResume).toHaveBeenCalledWith(saved);
    });

    it('is idempotent — calling resume(sameDocId) twice only fetches position once', async () => {
      const saved = makePosition(3);
      const getPosition = vi.fn().mockResolvedValue(saved);
      const savePosition = vi.fn().mockResolvedValue(saved);
      const getCurrent = vi.fn().mockReturnValue({ page: 1, offset: 0 });
      const onResume = vi.fn();
      const timers = makeFakeTimers();

      const ctrl = createReadingPositionController({
        getPosition,
        savePosition,
        getCurrent,
        onResume,
        debounceMs: 600,
        setTimer: timers.setTimer,
        clearTimer: timers.clearTimer,
      });

      ctrl.resume('doc-1');
      ctrl.resume('doc-1'); // same docId — no-op

      await Promise.resolve();
      await Promise.resolve();

      expect(getPosition).toHaveBeenCalledOnce();
      expect(onResume).toHaveBeenCalledOnce();
    });

    it('resume(otherDocId) re-arms — calls onResume for the new doc', async () => {
      const savedA = makePosition(2);
      const savedB = { ...makePosition(8), id: 'doc-2' };
      const getPosition = vi.fn()
        .mockResolvedValueOnce(savedA)
        .mockResolvedValueOnce(savedB);
      const savePosition = vi.fn();
      const getCurrent = vi.fn().mockReturnValue({ page: 1, offset: 0 });
      const onResume = vi.fn();
      const timers = makeFakeTimers();

      const ctrl = createReadingPositionController({
        getPosition,
        savePosition,
        getCurrent,
        onResume,
        debounceMs: 600,
        setTimer: timers.setTimer,
        clearTimer: timers.clearTimer,
      });

      ctrl.resume('doc-1');
      await Promise.resolve();
      await Promise.resolve();
      expect(onResume).toHaveBeenCalledOnce();

      ctrl.resume('doc-2');
      await Promise.resolve();
      await Promise.resolve();
      expect(onResume).toHaveBeenCalledTimes(2);
      expect(onResume).toHaveBeenLastCalledWith(savedB);
    });

    it('stale getPosition resolving after docId change does NOT call onResume', async () => {
      let resolveFirst!: (v: ReadingPosition) => void;
      const firstPromise = new Promise<ReadingPosition>((res) => { resolveFirst = res; });

      const savedB = { ...makePosition(5), id: 'doc-2' };
      const getPosition = vi.fn()
        .mockReturnValueOnce(firstPromise)   // doc-1: hangs until resolved manually
        .mockResolvedValueOnce(savedB);       // doc-2: resolves immediately

      const savePosition = vi.fn();
      const getCurrent = vi.fn().mockReturnValue({ page: 1, offset: 0 });
      const onResume = vi.fn();
      const timers = makeFakeTimers();

      const ctrl = createReadingPositionController({
        getPosition,
        savePosition,
        getCurrent,
        onResume,
        debounceMs: 600,
        setTimer: timers.setTimer,
        clearTimer: timers.clearTimer,
      });

      // Start doc-1 resume (hangs)
      ctrl.resume('doc-1');

      // Switch to doc-2 before doc-1's promise resolves
      ctrl.resume('doc-2');
      await Promise.resolve();
      await Promise.resolve();

      // Now resolve doc-1's stale promise
      resolveFirst(makePosition(99));
      await Promise.resolve();
      await Promise.resolve();

      // onResume should only have been called for doc-2
      expect(onResume).toHaveBeenCalledOnce();
      expect(onResume).toHaveBeenCalledWith(savedB);
    });

    it('no stored position → resume does nothing, never throws', async () => {
      const getPosition = vi.fn().mockResolvedValue(undefined);
      const savePosition = vi.fn();
      const getCurrent = vi.fn().mockReturnValue({ page: 1, offset: 0 });
      const onResume = vi.fn();
      const timers = makeFakeTimers();

      const ctrl = createReadingPositionController({
        getPosition,
        savePosition,
        getCurrent,
        onResume,
        debounceMs: 600,
        setTimer: timers.setTimer,
        clearTimer: timers.clearTimer,
      });

      await expect(async () => {
        ctrl.resume('doc-1');
        await Promise.resolve();
        await Promise.resolve();
      }).not.toThrow();

      expect(onResume).not.toHaveBeenCalled();
    });
  });

  describe('scheduleSave', () => {
    it('debounces a burst into a single savePosition call after debounceMs', async () => {
      const saved = makePosition(3);
      const getPosition = vi.fn().mockResolvedValue(undefined);
      const savePosition = vi.fn().mockResolvedValue(saved);
      let currentPos = { page: 1, offset: 0 };
      const getCurrent = vi.fn(() => currentPos);
      const onResume = vi.fn();
      const timers = makeFakeTimers();

      const ctrl = createReadingPositionController({
        getPosition,
        savePosition,
        getCurrent,
        onResume,
        debounceMs: 600,
        setTimer: timers.setTimer,
        clearTimer: timers.clearTimer,
      });

      // Burst of 3 scheduleSave calls
      currentPos = { page: 2, offset: 0.1 };
      ctrl.scheduleSave('doc-1');
      currentPos = { page: 2, offset: 0.3 };
      ctrl.scheduleSave('doc-1');
      currentPos = { page: 2, offset: 0.5 };
      ctrl.scheduleSave('doc-1');

      // Not saved yet (timer still pending)
      expect(savePosition).not.toHaveBeenCalled();

      // Advance past debounce
      timers.tick(600);
      await Promise.resolve();
      await Promise.resolve();

      // Exactly one call with the latest current position
      expect(savePosition).toHaveBeenCalledOnce();
      expect(savePosition).toHaveBeenCalledWith({ docId: 'doc-1', page: 2, offset: 0.5 });
    });

    it('a rejecting savePosition is swallowed — no throw propagates', async () => {
      const getPosition = vi.fn().mockResolvedValue(undefined);
      const savePosition = vi.fn().mockRejectedValue(new Error('network error'));
      const getCurrent = vi.fn().mockReturnValue({ page: 1, offset: 0 });
      const onResume = vi.fn();
      const timers = makeFakeTimers();

      const ctrl = createReadingPositionController({
        getPosition,
        savePosition,
        getCurrent,
        onResume,
        debounceMs: 600,
        setTimer: timers.setTimer,
        clearTimer: timers.clearTimer,
      });

      ctrl.scheduleSave('doc-1');

      await expect(async () => {
        timers.tick(600);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve(); // extra tick for rejection handling
      }).not.toThrow();
    });
  });

  describe('flush', () => {
    it('saves immediately and cancels the pending timer', async () => {
      const saved = makePosition(5, 0.7);
      const getPosition = vi.fn().mockResolvedValue(undefined);
      const savePosition = vi.fn().mockResolvedValue(saved);
      const getCurrent = vi.fn().mockReturnValue({ page: 5, offset: 0.7 });
      const onResume = vi.fn();
      const timers = makeFakeTimers();

      const ctrl = createReadingPositionController({
        getPosition,
        savePosition,
        getCurrent,
        onResume,
        debounceMs: 600,
        setTimer: timers.setTimer,
        clearTimer: timers.clearTimer,
      });

      ctrl.scheduleSave('doc-1');
      expect(savePosition).not.toHaveBeenCalled();

      ctrl.flush('doc-1');
      await Promise.resolve();
      await Promise.resolve();

      expect(savePosition).toHaveBeenCalledOnce();
      expect(savePosition).toHaveBeenCalledWith({ docId: 'doc-1', page: 5, offset: 0.7 });

      // Timer was cancelled — advancing past debounce should NOT fire another save
      timers.tick(600);
      await Promise.resolve();
      expect(savePosition).toHaveBeenCalledOnce(); // still one
    });

    it('flush with no pending save is a no-op', async () => {
      const getPosition = vi.fn().mockResolvedValue(undefined);
      const savePosition = vi.fn();
      const getCurrent = vi.fn().mockReturnValue({ page: 1, offset: 0 });
      const onResume = vi.fn();
      const timers = makeFakeTimers();

      const ctrl = createReadingPositionController({
        getPosition,
        savePosition,
        getCurrent,
        onResume,
        debounceMs: 600,
        setTimer: timers.setTimer,
        clearTimer: timers.clearTimer,
      });

      expect(() => { ctrl.flush('doc-1'); }).not.toThrow();
      expect(savePosition).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('clears any pending timer without saving', async () => {
      const getPosition = vi.fn().mockResolvedValue(undefined);
      const savePosition = vi.fn();
      const getCurrent = vi.fn().mockReturnValue({ page: 3, offset: 0.5 });
      const onResume = vi.fn();
      const timers = makeFakeTimers();

      const ctrl = createReadingPositionController({
        getPosition,
        savePosition,
        getCurrent,
        onResume,
        debounceMs: 600,
        setTimer: timers.setTimer,
        clearTimer: timers.clearTimer,
      });

      ctrl.scheduleSave('doc-1');
      ctrl.dispose();

      timers.tick(600);
      await Promise.resolve();

      expect(savePosition).not.toHaveBeenCalled();
    });
  });
});
