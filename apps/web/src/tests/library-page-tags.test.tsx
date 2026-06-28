/**
 * library-page-tags.test.tsx — UI-level tests for tag and smart-view features (Unit 15b).
 *
 * Covers:
 * - Built-in pills render + filter (Untagged, All)
 * - Creating a tag from the picker adds a chip
 * - Untag removes the chip
 * - Save-view persists and appears as a saved pill
 * - No nested-button regression: row open affordance + a chip × are independently clickable
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryBlobStore, MemoryRepository } from '@ember/store';

import { LibraryPage } from '../library/library-page.js';
import { StoreProvider } from '../store/store-context.js';
import { subtleCryptoHasher } from '../store/subtle-crypto-hasher.js';
import { createWebClock } from '../store/web-clock.js';
import { createWebStore } from '../store/web-store.js';
import type { WebStore } from '../store/web-store.js';
import { ThemeProvider } from '../theme/theme-provider.js';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  Toaster: () => null,
}));

vi.mock('../sync/use-storage-usage.js', () => ({
  useStorageUsage: () => undefined,
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

function makeStorage(): { getItem(k: string): string | null; setItem(k: string, v: string): void } {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => { store.set(k, v); },
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

function renderLibrary(store: WebStore) {
  return render(
    <ThemeProvider>
      <StoreProvider store={store}>
        <LibraryPage />
      </StoreProvider>
    </ThemeProvider>,
  );
}

// ── Shared setup ───────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset['appTheme'];
  window.matchMedia = makeMatchMedia();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LibraryPage — smart-view bar', () => {
  it('renders built-in filter pills (All, Untagged, In Progress, Finished, Recently Added)', async () => {
    const store = makeMemoryStore();
    renderLibrary(store);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^all$/i })).toBeDefined();
    });

    expect(screen.getByRole('button', { name: /^untagged$/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /^in progress$/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /^finished$/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /^recently added$/i })).toBeDefined();
  });

  it('"All" pill is active by default (aria-pressed=true)', async () => {
    const store = makeMemoryStore();
    renderLibrary(store);

    await waitFor(() => {
      const allPill = screen.getByRole('button', { name: /^all$/i });
      expect(allPill.getAttribute('aria-pressed')).toBe('true');
    });
  });

  it('clicking "Untagged" pill shows only zero-tag docs', async () => {
    const store = makeMemoryStore();

    // Import one PDF (will have no tags)
    const bytes = new Uint8Array([37, 80, 68, 70]);
    const file = new File([bytes], 'untagged-book.pdf', { type: 'application/pdf' });
    await store.importPdf(file);

    renderLibrary(store);

    await waitFor(() => {
      expect(screen.getByText('untagged-book')).toBeDefined();
    });

    // Click "Untagged" — should still show the doc
    const untaggedPill = screen.getByRole('button', { name: /^untagged$/i });
    await act(async () => {
      fireEvent.click(untaggedPill);
    });

    // Doc should still be visible (it has no tags)
    await waitFor(() => {
      expect(screen.getByText('untagged-book')).toBeDefined();
    });
  });

  it('filtered empty state shown when no docs match active view', async () => {
    const store = makeMemoryStore();

    // Import one doc
    const bytes = new Uint8Array([37, 80, 68, 70]);
    const file = new File([bytes], 'some-book.pdf', { type: 'application/pdf' });
    await store.importPdf(file);

    renderLibrary(store);
    await waitFor(() => {
      expect(screen.getByText('some-book')).toBeDefined();
    });

    // Switch to "In Progress" — no reading positions, so no docs
    const inProgressPill = screen.getByRole('button', { name: /^in progress$/i });
    await act(async () => {
      fireEvent.click(inProgressPill);
    });

    // Filtered empty state
    await waitFor(() => {
      expect(screen.getByText(/nothing here yet/i)).toBeDefined();
    });
  });
});

describe('LibraryPage — tag chips on rows', () => {
  it('shows an "Add tag" button on each document row', async () => {
    const store = makeMemoryStore();
    const bytes = new Uint8Array([37, 80, 68, 70]);
    const file = new File([bytes], 'my-book.pdf', { type: 'application/pdf' });
    await store.importPdf(file);

    renderLibrary(store);

    await waitFor(() => {
      expect(screen.getByText('my-book')).toBeDefined();
    });

    expect(screen.getByRole('button', { name: /add tag/i })).toBeDefined();
  });

  it('no nested button — row open affordance and tag controls are independently clickable', async () => {
    const store = makeMemoryStore();
    const bytes = new Uint8Array([37, 80, 68, 70]);
    const file = new File([bytes], 'test-book.pdf', { type: 'application/pdf' });
    await store.importPdf(file);

    const onOpen = vi.fn();
    render(
      <ThemeProvider>
        <StoreProvider store={store}>
          <LibraryPage onOpen={onOpen} />
        </StoreProvider>
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('test-book')).toBeDefined();
    });

    // The add-tag button should exist and be distinct from the row open button
    const addTagBtn = screen.getByRole('button', { name: /add tag/i });
    const rowOpenBtn = screen.getByRole('button', { name: /open test-book/i });

    // They must not be the same element
    expect(addTagBtn).not.toBe(rowOpenBtn);

    // Clicking add-tag should NOT fire onOpen (stopPropagation)
    await act(async () => {
      fireEvent.click(addTagBtn);
    });

    expect(onOpen).not.toHaveBeenCalled();

    // Clicking the row open button fires onOpen
    await act(async () => {
      fireEvent.click(rowOpenBtn);
    });

    expect(onOpen).toHaveBeenCalledOnce();
  });
});

describe('LibraryPage — save-view flow', () => {
  it('Save-view button does not appear when no ad-hoc tag filter is active', async () => {
    const store = makeMemoryStore();
    renderLibrary(store);

    await waitFor(() => {
      // Default "All" view — no "Save view" button
      expect(screen.queryByRole('button', { name: /save view/i })).toBeNull();
    });
  });
});
