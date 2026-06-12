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

// ── Mock sonner ────────────────────────────────────────────────────────────────

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
  Toaster: () => null,
}));

// ── helpers ────────────────────────────────────────────────────────────────────

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

// ── tests ─────────────────────────────────────────────────────────────────────

describe('LibraryPage', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['appTheme'];
    window.matchMedia = makeMatchMedia();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows the empty state when no documents are present', async () => {
    const store = makeMemoryStore();
    renderLibrary(store);

    // Wait for the async listDocuments call on mount to resolve
    await waitFor(() => {
      expect(screen.getByText(/waiting for its first spark/i)).toBeDefined();
    });
  });

  it('imports a PDF and shows a document row with its derived title', async () => {
    const store = makeMemoryStore();
    renderLibrary(store);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText(/waiting for its first spark/i)).toBeDefined();
    });

    // Import a fake PDF file
    const bytes = new Uint8Array([37, 80, 68, 70]); // %PDF magic bytes
    const file = new File([bytes], 'my-book.pdf', { type: 'application/pdf' });

    // Find the hidden file input and simulate a change event
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();

    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      fireEvent.change(input);
    });

    // Wait for the document row to appear
    await waitFor(() => {
      expect(screen.getByText('my-book')).toBeDefined();
    });

    // Empty state should no longer show
    expect(screen.queryByText(/waiting for its first spark/i)).toBeNull();

    // toast.success should have been called with the added message
    const { toast } = await import('sonner');
    expect(toast.success).toHaveBeenCalledWith(
      'Added to your library',
      expect.objectContaining({ description: expect.stringContaining('my-book') }),
    );
  });

  it('importing the same bytes twice shows a dedupe toast and no second row', async () => {
    const store = makeMemoryStore();
    renderLibrary(store);

    await waitFor(() => {
      expect(screen.getByText(/waiting for its first spark/i)).toBeDefined();
    });

    const bytes = new Uint8Array([37, 80, 68, 70, 99]);
    const file = new File([bytes], 'deduped.pdf', { type: 'application/pdf' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    // First import
    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      fireEvent.change(input);
    });

    await waitFor(() => {
      expect(screen.getByText('deduped')).toBeDefined();
    });

    // Second import of identical bytes
    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      fireEvent.change(input);
    });

    // Dedupe toast should have been called
    const { toast } = await import('sonner');
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(
        'Already in your library',
        expect.objectContaining({ description: expect.stringContaining('already in your collection') }),
      );
    });

    // Only one document row should exist
    const rows = document.querySelectorAll('li');
    expect(rows.length).toBe(1);
  });

  it('rejects a non-PDF file with a toast and adds no row', async () => {
    const store = makeMemoryStore();
    renderLibrary(store);

    await waitFor(() => {
      expect(screen.getByText(/waiting for its first spark/i)).toBeDefined();
    });

    const file = new File(['not a pdf'], 'notes.txt', { type: 'text/plain' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      fireEvent.change(input);
    });

    // toast.error should have been called with the rejected message
    const { toast } = await import('sonner');
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "That's not a PDF",
        expect.objectContaining({ description: expect.stringContaining("notes.txt") }),
      );
    });

    // Still shows empty state, no rows
    expect(screen.getByText(/waiting for its first spark/i)).toBeDefined();
  });

  // NOTE: theme-control aria-pressed test moved to app-shell.test.tsx (ThemeControl now lives in the shell).
});
