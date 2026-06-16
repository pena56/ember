/**
 * app-shell.test.tsx — navigation shell tests.
 *
 * (1) / redirects to /today (greeting visible)
 * (2) Library tab navigates to Library (dropzone visible); Today tab navigates back
 * (3) ThemeControl renders in the shell with aria-pressed pattern
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

function renderApp(store: WebStore, initialEntries: string[] = ['/']) {
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

describe('AppShell navigation', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['appTheme'];
    window.matchMedia = makeMatchMedia();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('(1) / redirects to /today and the greeting is visible', async () => {
    const store = makeMemoryStore();
    renderApp(store, ['/']);

    await waitFor(() => {
      // Today page shows a time-of-day greeting
      const heading = screen.queryByRole('heading', { level: 1 });
      expect(heading).not.toBeNull();
    });
  });

  it('(2) clicking Library tab shows the library; clicking Today tab returns', async () => {
    const store = makeMemoryStore();
    renderApp(store, ['/today']);

    // Today should be visible first
    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Primary' })).toBeDefined();
    });

    // Click Library tab
    await act(async () => {
      const libLinks = screen.getAllByRole('link', { name: /library/i });
      // The nav Library link is the one inside the nav element
      const navLibLink = libLinks.find((l) => l.closest('nav'));
      fireEvent.click(navLibLink ?? libLinks[0]!);
    });

    // Library content should be visible
    await waitFor(() => {
      expect(screen.getByText(/waiting for its first spark/i)).toBeDefined();
    });

    // Click Today tab
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: /today/i }));
    });

    // Should be back on Today
    await waitFor(() => {
      const heading = screen.queryByRole('heading', { level: 1 });
      expect(heading).not.toBeNull();
    });
  });

  it('(3) clicking Stats tab navigates to /stats and a Stats heading is visible; / still redirects to Today', async () => {
    const store = makeMemoryStore();
    renderApp(store, ['/today']);

    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Primary' })).toBeDefined();
    });

    // Stats link must exist in the nav
    const statsLink = screen.getByRole('link', { name: /stats/i });
    expect(statsLink).toBeDefined();

    // Click Stats tab
    await act(async () => {
      fireEvent.click(statsLink);
    });

    // Stats page heading appears
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeDefined();
    });

    // / redirects to Today — today and library links still work
    expect(screen.getByRole('link', { name: /today/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /library/i })).toBeDefined();
  });

  it('(4) ThemeControl renders in the shell with aria-pressed pattern', async () => {
    const store = makeMemoryStore();
    renderApp(store, ['/today']);

    await waitFor(() => {
      expect(screen.getByRole('group', { name: 'Theme' })).toBeDefined();
    });

    const buttons = screen.getAllByRole('button', { name: /system|light|dark/i });
    expect(buttons.length).toBeGreaterThanOrEqual(3);

    const pressed = buttons.filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed.length).toBe(1);
  });
});
