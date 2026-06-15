/**
 * app-navigation.test.tsx — clicking a DocumentRow opens the reader;
 * back button returns to the Library with the list intact.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

// ── Mock Convex auth (no real provider needed in jsdom) ───────────────────────

vi.mock('@convex-dev/auth/react', () => ({
  useAuthActions: () => ({ signIn: vi.fn(), signOut: vi.fn() }),
  useConvexAuth: () => ({ isLoading: true, isAuthenticated: false }),
  ConvexAuthProvider: ({ children }: { children: unknown }) => children,
}));

vi.mock('convex/react', () => ({
  useConvexAuth: () => ({ isLoading: true, isAuthenticated: false }),
  useQuery: () => undefined,
}));

vi.mock('../auth/use-anonymous-auth.js', () => ({ useAnonymousAuth: vi.fn() }));
vi.mock('../auth/use-account.js', () => ({ useAccount: () => ({ status: 'loading', email: undefined }) }));

// ── Mock pdf.js loader ────────────────────────────────────────────────────────

vi.mock('../reader/pdf.js', () => ({
  loadPdf: vi.fn().mockImplementation(() =>
    Promise.resolve({
      numPages: 2,
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

function makeMemoryStore(): WebStore {
  let counter = 0;
  return createWebStore({
    repo: new MemoryRepository(),
    blobs: new MemoryBlobStore(),
    hasher: subtleCryptoHasher,
    clock: createWebClock({
      storage: makeStorage(),
      now: () => Date.now(),
      newId: () => `test-id-${(++counter).toString()}`,
    }),
  });
}

function renderApp(store: WebStore) {
  return render(
    <ThemeProvider>
      <StoreProvider store={store}>
        <MemoryRouter initialEntries={['/library']}>
          <App />
        </MemoryRouter>
      </StoreProvider>
    </ThemeProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('App navigation', () => {
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

  it('clicking a DocumentRow opens the reader showing the document title; back returns to the Library', async () => {
    const store = makeMemoryStore();
    renderApp(store);

    // Wait for Library to mount
    await waitFor(() => {
      expect(screen.getByText(/waiting for its first spark/i)).toBeDefined();
    });

    // Import a PDF so there's a row
    const bytes = new Uint8Array([37, 80, 68, 70]);
    const file = new File([bytes], 'my-reading.pdf', { type: 'application/pdf' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      fireEvent.change(input);
    });

    await waitFor(() => {
      expect(screen.getByText('my-reading')).toBeDefined();
    });

    // Click the document row button to open the reader
    const openBtn = screen.getByRole('button', { name: /open my-reading/i });
    await act(async () => {
      fireEvent.click(openBtn);
    });

    // Reader should be visible (toolbar back button + title)
    await waitFor(() => {
      expect(screen.getByLabelText('Back to Library')).toBeDefined();
    });

    // Back to library
    fireEvent.click(screen.getByLabelText('Back to Library'));

    // Library list should be restored
    await waitFor(() => {
      expect(screen.getByText('my-reading')).toBeDefined();
    });
  });
});
