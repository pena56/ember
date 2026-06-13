/**
 * use-capture-page-count.test.tsx — hook integration tests.
 *
 * Verifies the fire-exactly-once-per-docId pattern, the !ready guard, the
 * numPages <= 0 guard, the re-fire-on-new-docId behaviour, and the
 * fire-and-forget error swallow.
 *
 * Harness: jsdom + @testing-library/react + injected StoreProvider stub with
 * a vi.fn() setDocumentPageCount — mirrors use-session-tracking.test.tsx.
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCapturePageCount } from '../reader/use-capture-page-count.js';
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
    recordSession: vi.fn().mockResolvedValue({}),
    listSessions: vi.fn().mockResolvedValue([]),
    getGoalConfig: vi.fn().mockResolvedValue({}),
    setDocumentPageCount: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as WebStore;
}

function makeWrapper(store: WebStore) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(StoreProvider, { store, children });
  };
}

function renderCapture(
  store: WebStore,
  props: { docId: string; ready: boolean; numPages: number },
) {
  return renderHook(() => useCapturePageCount(props), {
    wrapper: makeWrapper(store),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useCapturePageCount', () => {
  it('fires setDocumentPageCount once when ready and numPages > 0', async () => {
    const store = makeStubStore();
    const setPageCount = store.setDocumentPageCount as ReturnType<typeof vi.fn>;

    renderCapture(store, { docId: 'doc-1', ready: true, numPages: 42 });

    await act(async () => { await Promise.resolve(); });

    expect(setPageCount).toHaveBeenCalledOnce();
    expect(setPageCount).toHaveBeenCalledWith('doc-1', 42);
  });

  it('does not fire when ready is false', async () => {
    const store = makeStubStore();
    const setPageCount = store.setDocumentPageCount as ReturnType<typeof vi.fn>;

    renderCapture(store, { docId: 'doc-notready', ready: false, numPages: 10 });

    await act(async () => { await Promise.resolve(); });

    expect(setPageCount).not.toHaveBeenCalled();
  });

  it('does not fire when numPages is 0', async () => {
    const store = makeStubStore();
    const setPageCount = store.setDocumentPageCount as ReturnType<typeof vi.fn>;

    renderCapture(store, { docId: 'doc-zero', ready: true, numPages: 0 });

    await act(async () => { await Promise.resolve(); });

    expect(setPageCount).not.toHaveBeenCalled();
  });

  it('does not re-fire on re-render with unchanged props', async () => {
    const store = makeStubStore();
    const setPageCount = store.setDocumentPageCount as ReturnType<typeof vi.fn>;

    const { rerender } = renderCapture(store, { docId: 'doc-stable', ready: true, numPages: 5 });

    await act(async () => { await Promise.resolve(); });

    expect(setPageCount).toHaveBeenCalledOnce();

    // Re-render with same props
    rerender();
    await act(async () => { await Promise.resolve(); });

    // Still only called once
    expect(setPageCount).toHaveBeenCalledOnce();
  });

  it('re-fires for a new docId after rerender', async () => {
    const store = makeStubStore();
    const setPageCount = store.setDocumentPageCount as ReturnType<typeof vi.fn>;

    let props = { docId: 'doc-a', ready: true, numPages: 10 };
    const { rerender } = renderHook(() => useCapturePageCount(props), {
      wrapper: makeWrapper(store),
    });

    await act(async () => { await Promise.resolve(); });

    expect(setPageCount).toHaveBeenCalledOnce();
    expect(setPageCount).toHaveBeenCalledWith('doc-a', 10);

    // Switch to a new docId
    props = { docId: 'doc-b', ready: true, numPages: 20 };
    rerender();

    await act(async () => { await Promise.resolve(); });

    expect(setPageCount).toHaveBeenCalledTimes(2);
    expect(setPageCount).toHaveBeenLastCalledWith('doc-b', 20);
  });

  it('a rejected setDocumentPageCount is swallowed — hook does not throw', async () => {
    const store = makeStubStore({
      setDocumentPageCount: vi.fn().mockRejectedValue(new Error('db error')),
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      act(async () => {
        renderCapture(store, { docId: 'doc-reject', ready: true, numPages: 7 });
        await Promise.resolve();
        await Promise.resolve();
      }),
    ).resolves.not.toThrow();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[useCapturePageCount]'),
      expect.anything(),
    );
  });
});
