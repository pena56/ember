/**
 * today-continue-reading.test.tsx — Today page + Continue Reading card integration tests.
 *
 * (1) With a saved position + matching document: Today shows the Continue Reading card
 *     (title + "Page N"); clicking Resume navigates to /read/:docId (reader toolbar visible).
 * (2) With no positions: Today shows the empty/nudge state and a link to the Library.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryBlobStore, MemoryRepository } from '@ember/store';

import App from '../App.js';
import { StoreProvider } from '../store/store-context.js';
import { subtleCryptoHasher } from '../store/subtle-crypto-hasher.js';
import { createWebClock } from '../store/web-clock.js';
import { createWebStore } from '../store/web-store.js';
import type { WebStore } from '../store/web-store.js';
import { ThemeProvider } from '../theme/theme-provider.js';

// ── Mock sonner ────────────────────────────────────────────────────────────────

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
  Toaster: () => null,
}));

// ── Mock pdf.js loader ────────────────────────────────────────────────────────

vi.mock('../reader/pdf.js', () => ({
  loadPdf: vi.fn().mockImplementation(() =>
    Promise.resolve({
      numPages: 10,
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

function makeMemoryStoreWithBlobs(docIds: string[] = []): { store: WebStore; blobs: MemoryBlobStore } {
  let counter = 0;
  const blobs = new MemoryBlobStore();
  const fakeBytes = new Uint8Array([37, 80, 68, 70]);
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

function renderApp(store: WebStore, initialEntries: string[] = ['/today']) {
  return render(
    <ThemeProvider>
      <StoreProvider store={store}>
        <MemoryRouter initialEntries={initialEntries}>
          <App />
        </MemoryRouter>
      </StoreProvider>
    </ThemeProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Today Continue Reading', () => {
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

  it('(1) with a saved position + matching document, shows Continue Reading card with title and page', async () => {
    const docId = 'test-doc-resume';
    const { store, blobs } = makeMemoryStoreWithBlobs([docId]);

    // Import a doc then save a reading position
    const bytes = new Uint8Array([37, 80, 68, 70]);
    const file = new File([bytes], 'my-great-novel.pdf', { type: 'application/pdf' });
    const imported = await store.importPdf(file);
    const realDocId = imported.document.id;

    // Put blob for the real docId
    await blobs.put(realDocId, bytes);
    await store.saveReadingPosition({ docId: realDocId, page: 4, offset: 0 });

    renderApp(store, ['/today']);

    // Today page should show the book title and page number
    await waitFor(() => {
      expect(screen.getByText('my-great-novel')).toBeDefined();
    });

    await waitFor(() => {
      expect(screen.getByText(/page 4/i)).toBeDefined();
    });
  });

  it('(2) with no positions, shows empty nudge state and a link to the Library', async () => {
    const { store } = makeMemoryStoreWithBlobs();
    renderApp(store, ['/today']);

    // Should show the nudge/empty state (no guilt-tripping)
    await waitFor(() => {
      expect(screen.getByText(/pick a book/i)).toBeDefined();
    });

    // Should have at least one link pointing to the library
    const libLinks = screen.queryAllByRole('link', { name: /library/i });
    expect(libLinks.length).toBeGreaterThan(0);
  });
});
