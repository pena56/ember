/**
 * reader-page.test.tsx — behaviour tests for the PDF reader UI.
 *
 * jsdom has no canvas/worker, so we vi.mock the pdf.js loader module and the
 * use-pdf-document hook to return a controlled fake proxy. Tests assert reader
 * behaviour (toolbar content, mode toggle, theme control, error/missing states)
 * not pixels.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

// Fake PDFPageProxy factory
function makeFakePage(pageNum: number) {
  return {
    pageNumber: pageNum,
    getViewport: ({ scale }: { scale: number }) => ({
      width: 595 * scale,
      height: 842 * scale,
      scale,
    }),
    render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
    getTextContent: () =>
      Promise.resolve({
        items: [{ str: 'hello world', transform: [1, 0, 0, 1, 0, 0], width: 100, height: 12 }],
      }),
    cleanup: vi.fn(),
  };
}

// Fake PDFDocumentProxy
function makeFakePdf(numPages = 3) {
  return {
    numPages,
    getPage: (n: number) => Promise.resolve(makeFakePage(n)),
    cleanup: vi.fn().mockResolvedValue(undefined),
  };
}

// Mock the thin pdf.js loader module — vi.mock is hoisted
vi.mock('../reader/pdf.js', () => ({
  loadPdf: vi.fn().mockImplementation(() => Promise.resolve(makeFakePdf(3))),
}));

// Also mock pdfjs-dist TextLayer used in pdf-page (no canvas in jsdom)
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

function makeMemoryStore(blobsMap?: Map<string, Uint8Array>): WebStore {
  let counter = 0;
  const blobs = new MemoryBlobStore();

  // Pre-populate blobs if provided
  if (blobsMap) {
    for (const [id, bytes] of blobsMap) {
      void blobs.put(id, bytes);
    }
  }

  return createWebStore({
    repo: new MemoryRepository(),
    blobs,
    hasher: subtleCryptoHasher,
    clock: createWebClock({
      storage: makeStorage(),
      now: () => Date.now(),
      newId: () => `test-id-${(++counter).toString()}`,
    }),
  });
}

function renderReader(
  props: { docId: string; title?: string; onClose?: () => void },
  store?: WebStore,
) {
  const s = store ?? makeMemoryStore(new Map([['doc-1', new Uint8Array([37, 80, 68, 70])]]));
  const onClose = props.onClose ?? vi.fn();

  return {
    onClose,
    ...render(
      <ThemeProvider>
        <StoreProvider store={s}>
          <ReaderPage
            docId={props.docId}
            title={props.title ?? 'My Test Book'}
            onClose={onClose}
          />
        </StoreProvider>
      </ThemeProvider>,
    ),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ReaderPage', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['appTheme'];
    window.matchMedia = makeMatchMedia();

    // jsdom ResizeObserver stub — must be a real class/constructor
    class MockResizeObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(..._args: unknown[]) {}
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver);

    // jsdom IntersectionObserver stub
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

  it('renders loading state initially then toolbar with page 1 of N', async () => {
    renderReader({ docId: 'doc-1' });

    // Toolbar back button should appear immediately (before PDF loads)
    // Then wait for the ready state with the page indicator
    await waitFor(() => {
      expect(screen.getByLabelText('Back to Library')).toBeDefined();
    });

    // Once ready: page indicator
    await waitFor(() => {
      expect(screen.getByText(/page 1 of 3/i)).toBeDefined();
    });
  });

  it('shows scroll mode as the default with aria-pressed', async () => {
    renderReader({ docId: 'doc-1' });

    await waitFor(() => {
      const scrollBtn = screen.getByRole('button', { name: /scroll/i });
      expect(scrollBtn.getAttribute('aria-pressed')).toBe('true');
    });

    const pagedBtn = screen.getByRole('button', { name: /paged/i });
    expect(pagedBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('toggling to paged mode shows prev/next buttons', async () => {
    renderReader({ docId: 'doc-1' });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /paged/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /paged/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /next page/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /previous page/i })).toBeDefined();
    });

    // Paged button now pressed
    expect(screen.getByRole('button', { name: /paged/i }).getAttribute('aria-pressed')).toBe('true');
  });

  it('text-size stepper clamps at both ends', async () => {
    renderReader({ docId: 'doc-1' });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /increase text size/i })).toBeDefined();
    });

    const increase = () => screen.getByRole('button', { name: /increase text size/i }) as HTMLButtonElement;
    const decrease = () => screen.getByRole('button', { name: /decrease text size/i }) as HTMLButtonElement;

    // Default (middle) step: both directions available.
    expect(increase().disabled).toBe(false);
    expect(decrease().disabled).toBe(false);

    // Two steps up reaches the largest size → increase disables.
    fireEvent.click(increase());
    fireEvent.click(increase());
    expect(increase().disabled).toBe(true);

    // Four steps down reaches the smallest size → decrease disables.
    fireEvent.click(decrease());
    fireEvent.click(decrease());
    fireEvent.click(decrease());
    fireEvent.click(decrease());
    expect(decrease().disabled).toBe(true);
    expect(increase().disabled).toBe(false);
  });

  it('shows gentle error notice when pdf load fails, with working back action', async () => {
    // Import the mocked module and override for this test
    const { loadPdf } = await import('../reader/pdf.js');
    vi.mocked(loadPdf).mockRejectedValueOnce(new Error('parse error'));

    const onClose = vi.fn();
    renderReader({ docId: 'doc-1', onClose });

    await waitFor(() => {
      // Should show error notice — gentle message
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText(/something went wrong/i)).toBeDefined();
    });

    // Back to Library action works — click the one inside the alert notice
    const notice = screen.getByRole('alert');
    const backBtn = notice.querySelector('button');
    expect(backBtn).not.toBeNull();
    fireEvent.click(backBtn!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows gentle missing notice when bytes are undefined, with working back action', async () => {
    // Store with NO blobs — getPdfBytes returns undefined
    const store = makeMemoryStore();

    const onClose = vi.fn();
    renderReader({ docId: 'doc-nonexistent', onClose }, store);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText(/no longer available/i)).toBeDefined();
    });

    const notice = screen.getByRole('alert');
    const backBtn = notice.querySelector('button');
    expect(backBtn).not.toBeNull();
    fireEvent.click(backBtn!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('back chevron calls onClose', async () => {
    const onClose = vi.fn();
    renderReader({ docId: 'doc-1', onClose });

    await waitFor(() => {
      expect(screen.getByLabelText('Back to Library')).toBeDefined();
    });

    fireEvent.click(screen.getByLabelText('Back to Library'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
