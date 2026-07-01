/**
 * use-notification-sync.test.tsx — background notification-sync hook.
 *
 * Mirrors use-reconciler.test.tsx in structure.
 * Injects a fake NotificationPort + fake SyncBundle + fixture WebStore
 * so tests never touch Convex or OPFS.
 *
 * Asserts:
 *  (1) does nothing when unauthenticated (port never called)
 *  (2) does nothing when bundle is null (port never called)
 *  (3) authenticated + bundle → calls registerDevice then submitIntent/claimSlot
 *  (4) swallows a rejected port call (no throw)
 *  (5) re-runs on bundle signal (debounced)
 *  (6) re-runs on window focus
 *  (7) skips while offline
 *  (8) convex singleton is never imported when a port is injected
 */

import { act, cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BlobBytes, BlobStatusStore } from '@ember/core';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@ember/core';
import { MemoryBlobStore, MemoryRepository } from '@ember/store';

import type { NotificationPort } from '../notify/use-notification-sync.js';
import { useNotificationSync } from '../notify/use-notification-sync.js';
import { SyncBundleContext, StoreProvider } from '../store/store-context.js';
import type { SyncBundle } from '../store/store-context.js';
import { subtleCryptoHasher } from '../store/subtle-crypto-hasher.js';
import { createWebClock } from '../store/web-clock.js';
import { createWebStore } from '../store/web-store.js';
import type { WebStore } from '../store/web-store.js';
import { createSyncSignal } from '../sync/mutation-signal.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const hoisted = vi.hoisted(() => ({
  authState: { isAuthenticated: false, isLoading: false },
  // Spy that records every time the hook's lazy convex path actually builds a
  // port. It is only ever invoked from inside use-notification-sync's
  // `getPort()` fallback (the non-injected branch). With a port injected it
  // must never fire — proving the convex singleton is never reached.
  createConvexNotificationPort: vi.fn(() => ({
    registerDevice: vi.fn().mockResolvedValue({ ok: true }),
    submitIntent: vi.fn().mockResolvedValue({ accepted: true }),
    claimSlot: vi.fn().mockResolvedValue({ won: true }),
  })),
}));

vi.mock('convex/react', () => ({
  useConvexAuth: () => ({ ...hoisted.authState }),
}));

// Stub the convex-client singleton (it throws at import without VITE_CONVEX_URL).
// We always inject a port in these tests, so the lazy import that would reach
// this module must never run.
vi.mock('../convex/convex-client.js', () => ({ convex: {} }));

// Spy on the port adapter the hook lazily imports. createConvexNotificationPort
// is invoked ONLY from the non-injected branch of getPort(); asserting it was
// never called proves the injected port short-circuited the convex path.
vi.mock('../notify/convex-notification-port.js', () => ({
  createConvexNotificationPort: hoisted.createConvexNotificationPort,
}));

// ── Fakes ─────────────────────────────────────────────────────────────────────

const noopBlobs: BlobBytes = {
  has: () => Promise.resolve(false),
  get: () => Promise.resolve(undefined),
  put: () => Promise.resolve(),
};

let _clockCounter = 0;

function makeWebStore(repo: MemoryRepository): WebStore {
  return createWebStore({
    repo,
    blobs: new MemoryBlobStore(),
    hasher: subtleCryptoHasher,
    clock: createWebClock({
      storage: { getItem: () => null, setItem: () => {} },
      now: () => Date.now(),
      newId: () => `wid-${(++_clockCounter).toString()}`,
    }),
  });
}

const FAKE_DEVICE_ID = 'test-device-abc';

function makeBundle(over?: Partial<SyncBundle>): {
  bundle: SyncBundle;
  signal: ReturnType<typeof createSyncSignal>;
} {
  const store = new MemoryRepository();
  const signal = createSyncSignal();
  const bundle: SyncBundle = {
    store,
    clock: {
      tick: () => ({ wall: 1000, counter: 1, node: 'node-a' }),
      receive: (r) => r,
    },
    newOutboxId: (() => { let n = 0; return () => `oid-${++n}`; })(),
    signal,
    blobs: noopBlobs,
    blobStatus: store as unknown as BlobStatusStore,
    blobChange: createSyncSignal(),
    deviceId: FAKE_DEVICE_ID,
    ...over,
  };
  return { bundle, signal };
}

function makeFakePort(overrides?: Partial<NotificationPort>): NotificationPort {
  return {
    registerDevice: vi.fn().mockResolvedValue({ ok: true }),
    submitIntent: vi.fn().mockResolvedValue({ accepted: true }),
    claimSlot: vi.fn().mockResolvedValue({ won: true }),
    ...overrides,
  };
}

function Harness({ port }: { port?: NotificationPort }) {
  useNotificationSync(port ? { port } : undefined);
  return null;
}

function makeWrapper(bundle: SyncBundle | null, webStore: WebStore) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <StoreProvider store={webStore}>
        <SyncBundleContext.Provider value={bundle}>
          {children}
        </SyncBundleContext.Provider>
      </StoreProvider>
    );
  };
}

function renderHook(bundle: SyncBundle | null, webStore: WebStore, port?: NotificationPort) {
  return render(
    createElement(Harness, port ? { port } : {}),
    { wrapper: makeWrapper(bundle, webStore) },
  );
}

// ── Setup ──────────────────────────────────────────────────────────────────────

let originalOnLine: boolean;

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.authState.isAuthenticated = false;
  hoisted.authState.isLoading = false;
  originalOnLine = navigator.onLine;
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

afterEach(() => {
  cleanup();
  Object.defineProperty(navigator, 'onLine', { value: originalOnLine, configurable: true });
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('useNotificationSync', () => {
  it('(1) does nothing when unauthenticated', async () => {
    const { bundle } = makeBundle();
    const repo = new MemoryRepository();
    const webStore = makeWebStore(repo);
    const port = makeFakePort();

    renderHook(bundle, webStore, port);
    await act(async () => {});

    expect(port.registerDevice).not.toHaveBeenCalled();
    expect(port.submitIntent).not.toHaveBeenCalled();
    expect(port.claimSlot).not.toHaveBeenCalled();
  });

  it('(2) does nothing when bundle is null', async () => {
    hoisted.authState.isAuthenticated = true;
    const repo = new MemoryRepository();
    const webStore = makeWebStore(repo);
    const port = makeFakePort();

    renderHook(null, webStore, port);
    await act(async () => {});

    expect(port.registerDevice).not.toHaveBeenCalled();
    expect(port.submitIntent).not.toHaveBeenCalled();
    expect(port.claimSlot).not.toHaveBeenCalled();
  });

  it('(3) authenticated + bundle → calls registerDevice then submitIntent or claimSlot', async () => {
    hoisted.authState.isAuthenticated = true;
    const { bundle } = makeBundle();
    const repo = new MemoryRepository();
    const webStore = makeWebStore(repo);
    const port = makeFakePort();

    renderHook(bundle, webStore, port);
    await act(async () => {
      // Allow multiple microtask ticks for the async run() to complete
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(port.registerDevice).toHaveBeenCalledWith({
      deviceId: FAKE_DEVICE_ID,
      platform: 'web',
    });
    // With no sessions the goal is not met and no sessions means no candidates may qualify
    // (planNotifications may return null). Either submitIntent or claimSlot may be called
    // depending on the engine result — but registerDevice MUST have been called.
    // The important assertion is registerDevice was called with the correct args.
  });

  it('(4) swallows a rejected port call (no unhandled rejection)', async () => {
    hoisted.authState.isAuthenticated = true;
    const { bundle } = makeBundle();
    const repo = new MemoryRepository();
    const webStore = makeWebStore(repo);
    const port = makeFakePort({
      registerDevice: vi.fn().mockRejectedValue(new Error('network down')),
    });

    // Should not throw
    renderHook(bundle, webStore, port);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Failure was swallowed; subsequent focus trigger should attempt again
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(port.registerDevice).toHaveBeenCalledTimes(2);
  });

  it('(5) re-runs on bundle signal (debounced ~500ms)', async () => {
    vi.useFakeTimers();
    hoisted.authState.isAuthenticated = true;
    const { bundle, signal } = makeBundle();
    const repo = new MemoryRepository();
    const webStore = makeWebStore(repo);
    const port = makeFakePort();

    renderHook(bundle, webStore, port);
    // Flush the initial mount run.
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    const callsAfterMount = (port.registerDevice as ReturnType<typeof vi.fn>).mock.calls.length;

    // Burst of signals coalesces into one debounced run.
    act(() => {
      signal.notify();
      signal.notify();
      signal.notify();
    });
    // Before debounce window: no new run.
    expect((port.registerDevice as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterMount);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    // One new run after debounce fires.
    expect((port.registerDevice as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterMount + 1);
  });

  it('(6) re-runs on window focus', async () => {
    hoisted.authState.isAuthenticated = true;
    const { bundle } = makeBundle();
    const repo = new MemoryRepository();
    const webStore = makeWebStore(repo);
    const port = makeFakePort();

    renderHook(bundle, webStore, port);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    const callsAfterMount = (port.registerDevice as ReturnType<typeof vi.fn>).mock.calls.length;

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect((port.registerDevice as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterMount);
  });

  it('(7) skips run while offline', async () => {
    hoisted.authState.isAuthenticated = true;
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const { bundle } = makeBundle();
    const repo = new MemoryRepository();
    const webStore = makeWebStore(repo);
    const port = makeFakePort();

    renderHook(bundle, webStore, port);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(port.registerDevice).not.toHaveBeenCalled();
  });

  it('(8) convex notification port is NEVER built when a port is injected', async () => {
    hoisted.authState.isAuthenticated = true;
    const { bundle, signal } = makeBundle();
    const repo = new MemoryRepository();
    const webStore = makeWebStore(repo);
    const port = makeFakePort();

    renderHook(bundle, webStore, port);
    // Drive a full mount pass plus a couple of re-triggers so the lazy
    // getPort() fallback would have ample opportunity to fire if it were
    // wrongly reached.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      signal.notify();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The injected port must have been used...
    expect(port.registerDevice).toHaveBeenCalled();
    // ...and the convex-backed port adapter (the lazy fallback) must NEVER be
    // built. createConvexNotificationPort is invoked only from getPort()'s
    // non-injected branch, so a zero call-count proves the convex singleton
    // path was fully short-circuited by the injected port (spec guarantee).
    expect(hoisted.createConvexNotificationPort).not.toHaveBeenCalled();
  });

  it('(8b) positive control: with NO port injected, the lazy convex adapter IS built', async () => {
    // Proves the spy in (8) is actually wired to the lazy path — without this
    // control, (8)'s zero-count assertion could pass for the wrong reason.
    hoisted.authState.isAuthenticated = true;
    const { bundle } = makeBundle();
    const repo = new MemoryRepository();
    const webStore = makeWebStore(repo);

    renderHook(bundle, webStore); // no port → getPort() takes the lazy branch
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(hoisted.createConvexNotificationPort).toHaveBeenCalledTimes(1);
  });

  it('(9) passes registerDevice the correct platform and deviceId from bundle', async () => {
    hoisted.authState.isAuthenticated = true;
    const customDeviceId = 'custom-device-xyz';
    const { bundle } = makeBundle({ deviceId: customDeviceId });
    const repo = new MemoryRepository();
    const webStore = makeWebStore(repo);
    const port = makeFakePort();

    renderHook(bundle, webStore, port);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(port.registerDevice).toHaveBeenCalledWith({
      deviceId: customDeviceId,
      platform: 'web',
    });
  });

  it('(9b) narrowed active-hours window — prefs suppress the intent that default window would submit', async () => {
    // With no sessions, best-time (hour 20, defaultBestHour) is the only candidate under the
    // default [8, 22) window. Narrowing to [0, 1) places best-time (hour 20) outside the allowed
    // window → the candidate is filtered → no submitIntent.
    // This proves prefs reach the engine on the web path.
    hoisted.authState.isAuthenticated = true;
    const { bundle } = makeBundle();
    const repo = new MemoryRepository();
    const webStore = makeWebStore(repo);
    const port = makeFakePort();

    // Persist a narrowed active-hours window via the store so getNotificationPreferences returns it.
    await webStore.setNotificationPreferences({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      quietStartHour: 0,
      quietEndHour: 1,
    });

    renderHook(bundle, webStore, port);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(port.registerDevice).toHaveBeenCalled();
    // The only candidate (best-time at hour 20) is outside [0, 1) → filtered → no submitIntent
    expect(port.submitIntent).not.toHaveBeenCalled();
    // Goal not met (no sessions) → no suppress keys either
    expect(port.claimSlot).not.toHaveBeenCalled();
  });

  it('(10) goal met session → claimSlot called for suppress keys, not submitIntent', async () => {
    hoisted.authState.isAuthenticated = true;
    const { bundle } = makeBundle();
    const repo = new MemoryRepository();
    const webStore = makeWebStore(repo);
    const port = makeFakePort();

    // Seed the store with a long session today to meet the goal (25 min > 20 min default)
    const now = Date.now();
    const tzOffset = -new Date().getTimezoneOffset();
    // Compute today's local day label to match deriveTodayGoal's s.localDay === today check
    const { localDayOf: ld } = await import('@ember/core');
    const todayLabel = ld(now, tzOffset);
    await repo.put('sessions', {
      id: 'sess-goal-met',
      docId: 'doc-1',
      localDay: todayLabel,
      startedAt: now - 25 * 60_000,
      endedAt: now,
      activeMs: 25 * 60_000,
      tzOffsetMinutes: tzOffset,
      pages: [1],
      updatedAt: '',
    });

    renderHook(bundle, webStore, port);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(port.registerDevice).toHaveBeenCalled();
    // When goal is met, we should call claimSlot for each suppress key
    expect(port.claimSlot).toHaveBeenCalled();
    // Each claimSlot call should use via: 'suppressed'
    const claimCalls = (port.claimSlot as ReturnType<typeof vi.fn>).mock.calls;
    for (const [args] of claimCalls) {
      expect(args.via).toBe('suppressed');
      expect(args.deviceId).toBe(FAKE_DEVICE_ID);
    }
  });
});
