/**
 * library-view.test.tsx — list ⇄ grid toggle persistence + per-item actions wiring.
 *
 * Avoids opening the radix overflow menu (portal + pointer capture is flaky in
 * jsdom); the cascade delete itself is covered at the store layer
 * (packages/store delete-document.test.ts). Here we assert the toggle's
 * aria-pressed state, its localStorage persistence across remounts, and that each
 * item exposes an "Actions for {title}" trigger.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryBlobStore, MemoryRepository } from '@ember/store';

import { LibraryPage } from '../library/library-page.js';
import { StoreProvider } from '../store/store-context.js';
import { subtleCryptoHasher } from '../store/subtle-crypto-hasher.js';
import { createWebClock } from '../store/web-clock.js';
import { createWebStore } from '../store/web-store.js';
import type { WebStore } from '../store/web-store.js';
import { ThemeProvider } from '../theme/theme-provider.js';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  Toaster: () => null,
}));

vi.mock('../sync/use-storage-usage.js', () => ({
  useStorageUsage: () => undefined,
}));

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

function makeStorage(): { getItem(k: string): string | null; setItem(k: string, v: string): void } {
  const store = new Map<string, string>();
  return { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); } };
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

function renderLibrary(store: WebStore) {
  return render(
    <ThemeProvider>
      <StoreProvider store={store}>
        <LibraryPage />
      </StoreProvider>
    </ThemeProvider>,
  );
}

async function seedOneDoc(store: WebStore) {
  const bytes = new Uint8Array([37, 80, 68, 70]);
  await store.importPdf(new File([bytes], 'view-book.pdf', { type: 'application/pdf' }));
}

describe('LibraryPage — view toggle', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['appTheme'];
    window.matchMedia = makeMatchMedia();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('defaults to grid, switches to list, and persists the choice', async () => {
    const store = makeMemoryStore();
    await seedOneDoc(store);
    renderLibrary(store);

    await waitFor(() => {
      expect(screen.getByText('view-book')).toBeDefined();
    });

    const grid = screen.getByRole('button', { name: /grid view/i });
    const list = screen.getByRole('button', { name: /list view/i });

    // Default = grid
    expect(grid.getAttribute('aria-pressed')).toBe('true');
    expect(list.getAttribute('aria-pressed')).toBe('false');

    // Switch to list
    fireEvent.click(list);
    expect(list.getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('ember:library-view')).toBe('list');
  });

  it('restores the persisted list preference on a fresh mount', async () => {
    localStorage.setItem('ember:library-view', 'list');
    const store = makeMemoryStore();
    await seedOneDoc(store);
    renderLibrary(store);

    await waitFor(() => {
      expect(screen.getByText('view-book')).toBeDefined();
    });

    expect(screen.getByRole('button', { name: /list view/i }).getAttribute('aria-pressed')).toBe('true');
  });

  it('exposes an overflow actions trigger for each document', async () => {
    const store = makeMemoryStore();
    await seedOneDoc(store);
    renderLibrary(store);

    await waitFor(() => {
      expect(screen.getByText('view-book')).toBeDefined();
    });

    expect(screen.getByRole('button', { name: /actions for view-book/i })).toBeDefined();
  });
});
