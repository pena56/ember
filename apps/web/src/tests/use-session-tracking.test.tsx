/**
 * use-session-tracking.test.tsx — hook integration tests.
 *
 * Tests the timer/visibility/teardown plumbing and fire-and-forget error swallow.
 * Reducer math is fully covered by session-tracker.test.ts — this test only verifies
 * that the hook wires everything correctly.
 *
 * Harness: jsdom + @testing-library/react + vi.useFakeTimers + injected StoreProvider
 * stub capturing recordSession calls.
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlushedSession, ReadingSession } from '@ember/core';

import { useSessionTracking } from '../reader/use-session-tracking.js';
import { StoreProvider } from '../store/store-context.js';
import type { WebStore } from '../store/web-store.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStubStore(overrides?: Partial<WebStore>): WebStore {
  return {
    importPdf: vi.fn(),
    listDocuments: vi.fn().mockResolvedValue([]),
    getPdfBytes: vi.fn().mockResolvedValue(undefined),
    saveReadingPosition: vi.fn().mockResolvedValue({ id: 'x', page: 1, offset: 0, updatedAt: '' }),
    getReadingPosition: vi.fn().mockResolvedValue(undefined),
    listReadingPositions: vi.fn().mockResolvedValue([]),
    recordSession: vi.fn().mockResolvedValue({
      id: 'session-1',
      docId: 'doc-test',
      localDay: '2026-06-12',
      tzOffsetMinutes: 60,
      startedAt: 0,
      endedAt: 15_000,
      activeMs: 15_000,
      pages: [1],
      updatedAt: 'hlc-stamp',
    } satisfies ReadingSession),
    ...overrides,
  } as unknown as WebStore;
}

function makeWrapper(store: WebStore) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(StoreProvider, { store, children });
  };
}

function renderTracking(
  store: WebStore,
  props: { docId: string; ready: boolean; getPage: () => number },
) {
  return renderHook(() => useSessionTracking(props), {
    wrapper: makeWrapper(store),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useSessionTracking', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('mounting a ready reader opens a bout; advancing 15s fires a heartbeat activity; unmount close flushes one session', async () => {
    const store = makeStubStore();
    const recordSession = store.recordSession as ReturnType<typeof vi.fn>;

    const { unmount } = renderTracking(store, {
      docId: 'doc-test',
      ready: true,
      getPage: () => 1,
    });

    // Let effects run
    await act(async () => { await Promise.resolve(); });

    // recordSession should not have been called yet (no close)
    expect(recordSession).not.toHaveBeenCalled();

    // Advance 15s — heartbeat fires tracker.activity()
    await act(async () => {
      vi.advanceTimersByTime(15_000);
      await Promise.resolve();
    });

    // Still no flush — bout is open, activity just accrues
    expect(recordSession).not.toHaveBeenCalled();

    // Unmount → close() → flushed session (activeMs=15000 from the heartbeat)
    await act(async () => {
      unmount();
      await Promise.resolve();
    });

    expect(recordSession).toHaveBeenCalledOnce();
    const arg = recordSession.mock.calls[0]![0] as FlushedSession;
    expect(arg.docId).toBe('doc-test');
    expect(arg.activeMs).toBe(15_000);
  });

  it('visibilitychange→hidden stops the heartbeat (no further activity accrual after hide)', async () => {
    const store = makeStubStore();
    const recordSession = store.recordSession as ReturnType<typeof vi.fn>;

    const { unmount } = renderTracking(store, {
      docId: 'doc-vis',
      ready: true,
      getPage: () => 1,
    });

    await act(async () => { await Promise.resolve(); });

    // Advance 15s so there's real active time before hiding
    await act(async () => {
      vi.advanceTimersByTime(15_000);
      await Promise.resolve();
    });

    // Hide the tab — fires activity (caps the tail), then stops the heartbeat
    await act(async () => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });

    // Advance 30s more — heartbeat should be stopped, no more activity accrued
    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    // Unmount → close() flushes the bout
    await act(async () => {
      unmount();
      await Promise.resolve();
    });

    // The session should have been flushed (15s active before hide, then hidden with no more accrual)
    expect(recordSession).toHaveBeenCalledOnce();
    const arg = recordSession.mock.calls[0]![0] as FlushedSession;
    // active time = 15s (one heartbeat beat's worth, from open to hide-activity)
    expect(arg.activeMs).toBe(15_000);

    // Restore visibility state
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    });
  });

  it('visibilitychange→visible resumes the heartbeat', async () => {
    const store = makeStubStore();
    const recordSession = store.recordSession as ReturnType<typeof vi.fn>;

    const { unmount } = renderTracking(store, {
      docId: 'doc-vis2',
      ready: true,
      getPage: () => 1,
    });

    await act(async () => { await Promise.resolve(); });

    // Hide then show again
    await act(async () => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });

    await act(async () => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });

    // Advance 15s — heartbeat should have resumed and fire activity
    await act(async () => {
      vi.advanceTimersByTime(15_000);
      await Promise.resolve();
    });

    // Unmount → close
    await act(async () => {
      unmount();
      await Promise.resolve();
    });

    // recordSession called (session flushed)
    expect(recordSession).toHaveBeenCalled();

    // Restore
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    });
  });

  it('rejected recordSession is swallowed — hook does not throw', async () => {
    const store = makeStubStore({
      recordSession: vi.fn().mockRejectedValue(new Error('network error')),
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { unmount } = renderTracking(store, {
      docId: 'doc-reject',
      ready: true,
      getPage: () => 1,
    });

    await act(async () => { await Promise.resolve(); });

    // Advance 15s so there's something to flush on close
    await act(async () => {
      vi.advanceTimersByTime(15_000);
      await Promise.resolve();
    });

    // Unmount — close → recordSession rejects → should be swallowed
    await expect(
      act(async () => {
        unmount();
        await Promise.resolve();
        // Give microtasks (rejected promise) time to settle
        await Promise.resolve();
      }),
    ).resolves.not.toThrow();

    // The warning was emitted (invariant #1: log but don't throw)
    await act(async () => { await Promise.resolve(); });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[useSessionTracking]'),
      expect.anything(),
    );
  });

  it('ready=false does not open a bout', async () => {
    const store = makeStubStore();
    const recordSession = store.recordSession as ReturnType<typeof vi.fn>;

    const { unmount } = renderTracking(store, {
      docId: 'doc-notready',
      ready: false,
      getPage: () => 1,
    });

    await act(async () => { await Promise.resolve(); });

    // Advance and unmount — no open was fired, so no flush
    await act(async () => {
      vi.advanceTimersByTime(15_000);
      await Promise.resolve();
    });

    await act(async () => {
      unmount();
      await Promise.resolve();
    });

    expect(recordSession).not.toHaveBeenCalled();
  });
});
