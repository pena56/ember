/**
 * reader-restore.test.tsx — integration tests for reading-position capture/restore.
 *
 * Harness mirrors app-navigation.test.tsx: MemoryRepository + MemoryBlobStore +
 * createWebStore + stubbed ResizeObserver/IntersectionObserver + mocked pdf.js.
 *
 * Three cases:
 *   1. Opening a doc with a saved position calls getReadingPosition and sets the
 *      reader to the saved page (toolbar page indicator).
 *   2. A page turn triggers a debounced saveReadingPosition call (fake timers).
 *   3. Opening a doc with NO saved position stays on page 1 and does not throw.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryBlobStore, MemoryRepository } from '@ember/store';

import { ReaderPage } from '../reader/reader-page.js';
import { StoreProvider } from '../store/store-context.js';
import { subtleCryptoHasher } from '../store/subtle-crypto-hasher.js';
import { createWebClock } from '../store/web-clock.js';
import { createWebStore } from '../store/web-store.js';
import type { WebStore } from '../store/web-store.js';
import { ThemeProvider } from '../theme/theme-provider.js';

// ── Mock pdf.js loader ────────────────────────────────────────────────────────

vi.mock('../reader/pdf.js', () => ({
  loadPdf: vi.fn().mockImplementation(() =>
    Promise.resolve({
      numPages: 5,
      getPage: (n: number) =>
        Promise.resolve({
          pageNumber: n,
          getViewport: ({ scale }: { scale: number }) => ({
            width: 595 * scale,
            height: 842 * scale,
            scale,
          }),
          render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
          getTextContent: () => Promise.resolve({ items: [] }),
          cleanup: vi.fn(),
        }),
      cleanup: vi.fn().mockResolvedValue(undefined),
    }),
  ),
}));

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: vi.fn().mockImplementation(() => ({
    render: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn(),
  })),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMatchMedia(prefersDark = false) {
  return vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-color-scheme: dark)' ? prefersDark : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function makeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
  };
}

/**
 * Build a MemoryStore and optionally pre-populate the blob store with a fake PDF
 * for one or more docIds so that usePdfDocument reaches 'ready' state.
 * The loadPdf mock means any non-empty bytes will succeed.
 */
function makeMemoryStore(docIds: string[] = []): { store: WebStore; blobs: MemoryBlobStore } {
  let counter = 0;
  const blobs = new MemoryBlobStore();
  // Pre-populate fake bytes so getPdfBytes returns a non-undefined value
  const fakeBytes = new Uint8Array([37, 80, 68, 70]); // %PDF
  for (const id of docIds) {
    void blobs.put(id, fakeBytes);
  }
  const store = createWebStore({
    repo: new MemoryRepository(),
    blobs,
    hasher: subtleCryptoHasher,
    clock: createWebClock({
      storage: makeStorage(),
      now: () => Date.now(),
      newId: () => `test-id-${(++counter).toString()}`,
    }),
  });
  return { store, blobs };
}

function renderReader(
  props: { docId: string; title?: string; onClose?: () => void },
  store: WebStore,
) {
  return render(
    <ThemeProvider>
      <StoreProvider store={store}>
        <ReaderPage
          docId={props.docId}
          title={props.title ?? 'Test Book'}
          onClose={props.onClose ?? vi.fn()}
        />
      </StoreProvider>
    </ThemeProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('reader reading-position restore', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['appTheme'];
    window.matchMedia = makeMatchMedia();

    class MockResizeObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(..._args: unknown[]) {}
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver);

    class MockIntersectionObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(..._args: unknown[]) {}
    }
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('(1) opening a doc with a saved position calls getReadingPosition and sets the reader to the saved page', async () => {
    const docId = 'doc-resume-test';
    const { store } = makeMemoryStore([docId]);

    // Pre-save position for docId
    await store.saveReadingPosition({ docId, page: 3, offset: 0.25 });

    // Spy on getReadingPosition
    const getSpy = vi.spyOn(store, 'getReadingPosition');

    await act(async () => {
      renderReader({ docId }, store);
    });

    // Wait for reader to be ready and position restored
    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledWith(docId);
    });

    // Page indicator should reflect page 3 (the saved page)
    await waitFor(() => {
      expect(screen.getByText(/page 3 of 5/i)).toBeDefined();
    });
  });

  it('(2) a page turn triggers a debounced saveReadingPosition call', async () => {
    vi.useFakeTimers();

    const docId = 'doc-save-test';
    const { store } = makeMemoryStore([docId]);

    const saveSpy = vi.spyOn(store, 'saveReadingPosition');

    await act(async () => {
      renderReader({ docId }, store);
    });

    // Wait for ready state
    await act(async () => {
      await Promise.resolve();
    });

    // Switch to paged mode so we can trigger a page turn via button click
    await act(async () => {
      const pagedBtn = screen.queryByRole('button', { name: /paged/i });
      if (pagedBtn) fireEvent.click(pagedBtn);
    });

    // Click "Next page"
    await act(async () => {
      const nextBtn = screen.queryByRole('button', { name: /next page/i });
      if (nextBtn) fireEvent.click(nextBtn);
    });

    // saveSpy should NOT have been called yet (debounce pending)
    expect(saveSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ docId, page: 2 }),
    );

    // Advance timers past debounce delay (~600ms)
    await act(async () => {
      vi.advanceTimersByTime(700);
      await Promise.resolve();
    });

    // Now save should have been called with the new page
    expect(saveSpy).toHaveBeenCalledWith(
      expect.objectContaining({ docId, page: 2 }),
    );

    vi.useRealTimers();
  });

  it('(3) opening a doc with no saved position stays on page 1 and does not throw', async () => {
    const docId = 'doc-no-position';
    const { store } = makeMemoryStore([docId]);

    // No position saved — should not throw, stays page 1
    await expect(
      act(async () => {
        renderReader({ docId }, store);
        await Promise.resolve();
      }),
    ).resolves.not.toThrow();

    await waitFor(() => {
      expect(screen.getByLabelText('Back to Library')).toBeDefined();
    });

    // Page indicator should be page 1
    await waitFor(() => {
      expect(screen.getByText(/page 1 of 5/i)).toBeDefined();
    });
  });
});
