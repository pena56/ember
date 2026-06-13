/**
 * today-habit.test.tsx — Today page habit header (streak ember + goal ring) integration tests.
 *
 * Renders <App/> at /today inside StoreProvider with an injected stub WebStore so we control
 * the session log + goal config the habit header derives from. Fixtures are stamped on "today"
 * computed identically to the hook (localDayOf(Date.now(), -getTimezoneOffset())) so they land
 * on the current local day.
 *
 *  (1) lit streak: 3 consecutive read-days ending today + today ≥ target → count 3, goal met.
 *  (2) in-progress goal: today below target → ring label "N / 20 min", not met.
 *  (3) empty/offline: listSessions rejects → page still renders, "Start your streak" + empty ring.
 *  (4) loading → resolved: skeleton shows first, real numbers after the awaits settle.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReadingSession } from '@ember/core';
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

// ── Mock pdf.js loader (App pulls these in via the reader bundle) ────────────────

vi.mock('../reader/pdf.js', () => ({
  loadPdf: vi.fn(),
}));

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: vi.fn(),
}));

// ── Day helpers ─────────────────────────────────────────────────────────────────

/** The local-day label the hook will compute — fixtures must match. */
function todayLabel(): string {
  return localDayOf(Date.now(), -new Date().getTimezoneOffset());
}

/** The calendar-day label `k` days before `day` (UTC arithmetic on the label). */
function daysBefore(day: string, k: number): string {
  return new Date(Date.parse(day + 'T00:00:00Z') - k * 86_400_000).toISOString().slice(0, 10);
}

function makeSession(localDay: string, activeMs: number, idx: number): ReadingSession {
  return {
    id: `session-${localDay}-${idx.toString()}`,
    docId: 'doc-1',
    localDay,
    tzOffsetMinutes: -new Date().getTimezoneOffset(),
    startedAt: 0,
    endedAt: activeMs,
    activeMs,
    pages: [1],
    updatedAt: '',
  };
}

const DEFAULT_GOAL: GoalConfigRecord = {
  id: 'goal-config',
  targetActiveMs: DEFAULT_GOAL_ACTIVE_MS,
  updatedAt: '',
};

// ── Stub WebStore ───────────────────────────────────────────────────────────────

interface StubOptions {
  sessions?: ReadingSession[];
  goal?: GoalConfigRecord;
  /** When set, listSessions rejects (simulates an offline/read failure — invariant #1). */
  failSessions?: boolean;
  /** When set, listSessions resolves only when this promise settles (loading-state test). */
  gate?: Promise<void>;
}

function makeStubStore(opts: StubOptions = {}): WebStore {
  const sessions = opts.sessions ?? [];
  const goal = opts.goal ?? DEFAULT_GOAL;

  const notUsed = (name: string) => () => {
    throw new Error(`stub WebStore.${name} should not be called by the Today route`);
  };

  return {
    listDocuments: () => Promise.resolve([]),
    listReadingPositions: () => Promise.resolve([]),
    async listSessions() {
      if (opts.gate) await opts.gate;
      if (opts.failSessions) throw new Error('offline');
      return sessions;
    },
    getGoalConfig: () => Promise.resolve(goal),
    importPdf: notUsed('importPdf') as WebStore['importPdf'],
    getPdfBytes: notUsed('getPdfBytes') as WebStore['getPdfBytes'],
    saveReadingPosition: notUsed('saveReadingPosition') as WebStore['saveReadingPosition'],
    getReadingPosition: notUsed('getReadingPosition') as WebStore['getReadingPosition'],
    recordSession: notUsed('recordSession') as WebStore['recordSession'],
  };
}

// ── Render harness ───────────────────────────────────────────────────────────────

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
        <MemoryRouter initialEntries={['/today']}>
          <App />
        </MemoryRouter>
      </StoreProvider>
    </ThemeProvider>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────────

describe('Today habit header', () => {
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

  it('(1) lit 3-day streak with today ≥ target renders count 3 and a met goal', async () => {
    const today = todayLabel();
    const sessions = [
      makeSession(today, DEFAULT_GOAL_ACTIVE_MS, 0),
      makeSession(daysBefore(today, 1), DEFAULT_GOAL_ACTIVE_MS, 1),
      makeSession(daysBefore(today, 2), DEFAULT_GOAL_ACTIVE_MS, 2),
    ];
    renderApp(makeStubStore({ sessions }));

    // Streak ember announces a 3-day, lit streak
    await waitFor(() => {
      expect(screen.getByRole('img', { name: /3 days reading streak, lit today/i })).toBeDefined();
    });

    // Goal ring announces "met"
    expect(screen.getByRole('img', { name: /today's goal met/i })).toBeDefined();
  });

  it('(2) in-progress goal below target shows "N / 20 min" and not met', async () => {
    const today = todayLabel();
    // 12 minutes of 20 today, single read-day → lit but not met
    const sessions = [makeSession(today, 12 * 60_000, 0)];
    renderApp(makeStubStore({ sessions }));

    await waitFor(() => {
      // role=img aria-label reflects in-progress, not "met"
      const ring = screen.getByRole('img', { name: /today's goal: 12 of 20 minutes/i });
      expect(ring).toBeDefined();
    });

    // The "met" label must NOT be present
    expect(screen.queryByRole('img', { name: /today's goal met/i })).toBeNull();
    // Center label shows the fraction
    expect(screen.getByText('12 / 20 min')).toBeDefined();
  });

  it('(3) when listSessions fails, Today still renders with a Start your streak nudge and empty ring', async () => {
    renderApp(makeStubStore({ failSessions: true }));

    await waitFor(() => {
      expect(screen.getByRole('img', { name: /start your streak/i })).toBeDefined();
    });

    // Empty ring: 0 of 20 minutes, not met
    expect(screen.getByRole('img', { name: /today's goal: 0 of 20 minutes/i })).toBeDefined();
    // Page did not throw — greeting still rendered
    expect(screen.getByRole('heading', { level: 1 })).toBeDefined();
  });

  it('(4) shows a loading skeleton first, then resolves to real numbers', async () => {
    const today = todayLabel();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sessions = [makeSession(today, DEFAULT_GOAL_ACTIVE_MS, 0)];
    renderApp(makeStubStore({ sessions, gate }));

    // While the gated read is pending, the calm skeleton is shown (no fake numbers)
    await waitFor(() => {
      expect(screen.getByLabelText(/loading habit summary/i)).toBeDefined();
    });
    expect(screen.queryByRole('img', { name: /today's goal/i })).toBeNull();

    // Let the read settle → real surfaces appear, skeleton gone
    release();
    await waitFor(() => {
      expect(screen.getByRole('img', { name: /today's goal met/i })).toBeDefined();
    });
    expect(screen.queryByLabelText(/loading habit summary/i)).toBeNull();
  });
});
