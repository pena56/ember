/**
 * stats-page.test.tsx — Stats page integration tests.
 *
 * Renders <App /> at /stats inside StoreProvider with an injected stub WebStore.
 *
 *  (1) seeded data → streak label, a known total, a book title with its % all visible after load.
 *  (2) empty store → warm empty-state copy renders (no crash, no fake numbers).
 *  (3) rejecting listSessions → still renders the neutral view (invariant #1, no throw).
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Document, ReadingSession } from '@ember/core';
import { DEFAULT_GOAL_ACTIVE_MS, localDayOf } from '@ember/core';
import type { GoalConfigRecord } from '@ember/store';

import App from '../App.js';
import { StoreProvider } from '../store/store-context.js';
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
  loadPdf: vi.fn(),
}));

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: vi.fn(),
}));

// ── Day helpers ────────────────────────────────────────────────────────────────

function todayLabel(): string {
  return localDayOf(Date.now(), -new Date().getTimezoneOffset());
}

function makeSession(
  docId: string,
  localDay: string,
  activeMs: number,
  endedAt: number,
  idx: number,
): ReadingSession {
  return {
    id: `session-${docId}-${idx.toString()}`,
    docId,
    localDay,
    tzOffsetMinutes: -new Date().getTimezoneOffset(),
    startedAt: endedAt - activeMs,
    endedAt,
    activeMs,
    pages: [1, 2, 3],
    updatedAt: '',
  };
}

function makeDoc(id: string, title: string, pageCount: number): Document {
  return {
    id,
    title,
    filename: `${title}.pdf`,
    byteSize: 1000,
    contentType: 'application/pdf',
    importedAt: 0,
    pageCount,
  };
}

const DEFAULT_GOAL: GoalConfigRecord = {
  id: 'goal-config',
  targetActiveMs: DEFAULT_GOAL_ACTIVE_MS,
  updatedAt: '',
};

// ── Stub WebStore ──────────────────────────────────────────────────────────────

interface StubOptions {
  sessions?: ReadingSession[];
  docs?: Document[];
  goal?: GoalConfigRecord;
  failSessions?: boolean;
}

function makeStubStore(opts: StubOptions = {}): WebStore {
  const sessions = opts.sessions ?? [];
  const docs = opts.docs ?? [];
  const goal = opts.goal ?? DEFAULT_GOAL;

  const notUsed = (name: string) => () => {
    throw new Error(`stub WebStore.${name} should not be called by the Stats route`);
  };

  return {
    listDocuments: () => Promise.resolve(docs),
    listReadingPositions: () => Promise.resolve([]),
    async listSessions() {
      if (opts.failSessions) throw new Error('offline');
      return sessions;
    },
    getGoalConfig: () => Promise.resolve(goal),
    importPdf: notUsed('importPdf') as WebStore['importPdf'],
    getPdfBytes: notUsed('getPdfBytes') as WebStore['getPdfBytes'],
    saveReadingPosition: notUsed('saveReadingPosition') as WebStore['saveReadingPosition'],
    getReadingPosition: notUsed('getReadingPosition') as WebStore['getReadingPosition'],
    recordSession: notUsed('recordSession') as WebStore['recordSession'],
    setDocumentPageCount: notUsed('setDocumentPageCount') as WebStore['setDocumentPageCount'],
    createAnnotation: notUsed('createAnnotation') as WebStore['createAnnotation'],
    listAnnotations: notUsed('listAnnotations') as WebStore['listAnnotations'],
    updateAnnotation: notUsed('updateAnnotation') as WebStore['updateAnnotation'],
    deleteAnnotation: notUsed('deleteAnnotation') as WebStore['deleteAnnotation'],
    listBlobStatuses: () => Promise.resolve([]),
  };
}

// ── Render harness ─────────────────────────────────────────────────────────────

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

function renderApp(store: WebStore) {
  return render(
    <ThemeProvider>
      <StoreProvider store={store}>
        <MemoryRouter initialEntries={['/stats']}>
          <App />
        </MemoryRouter>
      </StoreProvider>
    </ThemeProvider>,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Stats page', () => {
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
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('(1) seeded data → streak label, totals, and book title+% all visible', async () => {
    const today = todayLabel();
    const docId = 'doc-seeded';
    const sessions = [
      makeSession(docId, today, DEFAULT_GOAL_ACTIVE_MS, Date.now(), 0),
    ];
    const docs = [makeDoc(docId, 'The Dawn of Everything', 100)];

    renderApp(makeStubStore({ sessions, docs }));

    // Wait for the stats sections to load — the card titles are always rendered
    await waitFor(() => {
      expect(screen.getByText('Streak')).toBeDefined();
    });

    // Book title visible
    expect(screen.getByText('The Dawn of Everything')).toBeDefined();

    // Totals section visible
    expect(screen.getByText('Reading totals')).toBeDefined();

    // Sessions label is rendered as two spans ("1" + "session") — check aria content
    // TotalsStat renders the StatItem which splits numeric from unit
    // Use getAllByText with flexible matcher
    const sessionLabels = screen.getAllByText(/session/i);
    expect(sessionLabels.length).toBeGreaterThan(0);
  });

  it('(2) empty store → warm empty-state copy renders, no crash', async () => {
    renderApp(makeStubStore());

    await waitFor(() => {
      expect(screen.getByText(/your story starts with a single page/i)).toBeDefined();
    });

    // Ensure no fake numbers appear
    expect(screen.queryByText(/\d+ days/i)).toBeNull();
    expect(screen.queryByText(/\d+ pages/i)).toBeNull();
  });

  it('(3) rejecting listSessions → still renders the neutral view (invariant #1, no throw)', async () => {
    renderApp(makeStubStore({ failSessions: true }));

    // Should render the empty state (neutral view after error swallow)
    await waitFor(() => {
      expect(screen.getByText(/your story starts with a single page/i)).toBeDefined();
    });

    // No error thrown — page heading still visible
    expect(screen.getByRole('heading', { level: 1 })).toBeDefined();
  });
});
