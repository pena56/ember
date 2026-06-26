/**
 * use-reconciler.test.tsx — the web sync scheduler.
 *
 * Renders useReconciler inside a provider supplying a fake SyncBundle
 * (MemoryRepository as store, a fake monotone clock, a real createSyncSignal) +
 * a fake transport; mocks convex/react's useConvexAuth and the convex-client
 * singleton (so importing the hook never throws).
 *
 * Asserts:
 *   (1) no run while unauthenticated
 *   (2) one run on auth-ready
 *   (3) signal.notify() schedules a debounced run (fake timers)
 *   (4) interval fires runs
 *   (5) overlap guard — concurrent triggers during an in-flight run coalesce
 *       into exactly one trailing run, never concurrent reconciles
 *   (6) offline skips; an `online` event triggers a run
 *   (7) a throwing transport is swallowed; the next trigger still runs
 *   (8) a real end-to-end push + pull + furthest-page-correction flows through
 *       the fake transport + MemoryRepository (proves wiring, not merge)
 */

import { act, cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  encode,
  makeOutboxEntry,
  makeReadingPosition,
  PULL_CURSOR_ID,
  SYNC_META_COLLECTION,
} from '@ember/core';
import type { BlobBytes, BlobStatusStore, Hlc, OutboxEntry, RemoteEntry, SyncTransport } from '@ember/core';
import { MemoryRepository } from '@ember/store';

import { SyncBundleContext } from '../store/store-context.js';
import type { SyncBundle } from '../store/store-context.js';
import { createSyncSignal } from '../sync/mutation-signal.js';
import { useReconciler } from '../sync/use-reconciler.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const hoisted = vi.hoisted(() => ({ authState: { isAuthenticated: false, isLoading: false } }));

vi.mock('convex/react', () => ({
  useConvexAuth: () => ({ ...hoisted.authState }),
}));

// The convex-client singleton throws at import time without VITE_CONVEX_URL.
// We always inject a transport, so the value is never used — just stub it.
vi.mock('../convex/convex-client.js', () => ({ convex: {} }));

// ── Fakes ──────────────────────────────────────────────────────────────────────

/** A fake monotone clock — enough for the reconciler's tick/receive. */
function fakeClock(): { tick: () => Hlc; receive: (r: Hlc) => Hlc } {
  const state = { counter: 0 };
  return {
    tick(): Hlc {
      return { wall: 1000, counter: ++state.counter, node: 'node-a' };
    },
    receive(remote: Hlc): Hlc {
      state.counter = Math.max(state.counter, remote.counter) + 1;
      return { wall: Math.max(1000, remote.wall), counter: state.counter, node: 'node-a' };
    },
  };
}

/** Minimal no-op BlobBytes stub — reconciler tests don't exercise blob-sync. */
const noopBlobs: BlobBytes = {
  has: () => Promise.resolve(false),
  get: () => Promise.resolve(undefined),
  put: () => Promise.resolve(),
};

function makeBundle(over?: Partial<SyncBundle>): { bundle: SyncBundle; store: MemoryRepository; signal: ReturnType<typeof createSyncSignal> } {
  const store = new MemoryRepository();
  const signal = createSyncSignal();
  const clock = fakeClock();
  const bundle: SyncBundle = {
    store,
    clock: { tick: clock.tick, receive: clock.receive },
    newOutboxId: (() => {
      let n = 0;
      return () => `oid-${++n}`;
    })(),
    signal,
    blobs: noopBlobs,
    blobStatus: store as unknown as BlobStatusStore,
    ...over,
  };
  return { bundle, store, signal };
}

function Harness({ transport, intervalMs }: { transport: SyncTransport; intervalMs?: number }) {
  useReconciler({ transport, ...(intervalMs !== undefined ? { intervalMs } : {}) });
  return null;
}

function renderHook(bundle: SyncBundle, transport: SyncTransport, intervalMs?: number) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(SyncBundleContext.Provider, { value: bundle }, children);
  return render(createElement(Harness, { transport, ...(intervalMs !== undefined ? { intervalMs } : {}) }), {
    wrapper,
  });
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

describe('useReconciler', () => {
  it('(1) does not run while unauthenticated', async () => {
    const { bundle } = makeBundle();
    const transport: SyncTransport = {
      push: vi.fn().mockResolvedValue({ acked: [] }),
      pull: vi.fn().mockResolvedValue({ entries: [], cursor: 0 }),
    };

    renderHook(bundle, transport);
    await act(async () => {});

    expect(transport.pull).not.toHaveBeenCalled();
    expect(transport.push).not.toHaveBeenCalled();
  });

  it('(2) runs once on auth-ready', async () => {
    hoisted.authState.isAuthenticated = true;
    const { bundle } = makeBundle();
    const transport: SyncTransport = {
      push: vi.fn().mockResolvedValue({ acked: [] }),
      pull: vi.fn().mockResolvedValue({ entries: [], cursor: 0 }),
    };

    renderHook(bundle, transport);
    await act(async () => {});

    expect(transport.pull).toHaveBeenCalledTimes(1);
  });

  it('(3) signal.notify() schedules a debounced run', async () => {
    vi.useFakeTimers();
    hoisted.authState.isAuthenticated = true;
    const { bundle, signal } = makeBundle();
    const transport: SyncTransport = {
      push: vi.fn().mockResolvedValue({ acked: [] }),
      pull: vi.fn().mockResolvedValue({ entries: [], cursor: 0 }),
    };

    renderHook(bundle, transport);
    // Flush the immediate auth-ready run.
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    (transport.pull as ReturnType<typeof vi.fn>).mockClear();

    // Burst of notifies coalesces to a single debounced run.
    act(() => {
      signal.notify();
      signal.notify();
      signal.notify();
    });
    // Before the debounce window elapses: no run yet.
    expect(transport.pull).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(transport.pull).toHaveBeenCalledTimes(1);
  });

  it('(4) interval fires runs', async () => {
    vi.useFakeTimers();
    hoisted.authState.isAuthenticated = true;
    const { bundle } = makeBundle();
    const transport: SyncTransport = {
      push: vi.fn().mockResolvedValue({ acked: [] }),
      pull: vi.fn().mockResolvedValue({ entries: [], cursor: 0 }),
    };

    renderHook(bundle, transport, 1000);
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    const afterMount = (transport.pull as ReturnType<typeof vi.fn>).mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect((transport.pull as ReturnType<typeof vi.fn>).mock.calls.length).toBe(afterMount + 1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect((transport.pull as ReturnType<typeof vi.fn>).mock.calls.length).toBe(afterMount + 2);
  });

  it('(5) overlap guard coalesces concurrent triggers into one trailing run (never concurrent)', async () => {
    hoisted.authState.isAuthenticated = true;
    const { bundle, signal } = makeBundle();

    let concurrent = 0;
    let maxConcurrent = 0;
    let resolveCurrent: (() => void) | undefined;

    const pull = vi.fn().mockImplementation(async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      // Hold the first reconcile open until we release it.
      await new Promise<void>((resolve) => {
        resolveCurrent = resolve;
      });
      concurrent -= 1;
      return { entries: [], cursor: 0 };
    });
    const transport: SyncTransport = { push: vi.fn().mockResolvedValue({ acked: [] }), pull };

    renderHook(bundle, transport);
    // Let the auth-ready run start and block inside pull.
    await act(async () => {});
    expect(pull).toHaveBeenCalledTimes(1);

    // While in-flight, fire several more triggers — they must coalesce.
    act(() => {
      signal.notify();
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('focus'));
    });

    // Release the in-flight reconcile; exactly one trailing pass should follow.
    await act(async () => {
      resolveCurrent?.();
      await Promise.resolve();
      await Promise.resolve();
      resolveCurrent?.(); // release the trailing pass too
      await Promise.resolve();
    });

    expect(maxConcurrent).toBe(1); // never two reconciles at once
    expect(pull).toHaveBeenCalledTimes(2); // initial + exactly one trailing
  });

  it('(6) skips while offline and runs on the online event', async () => {
    hoisted.authState.isAuthenticated = true;
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const { bundle } = makeBundle();
    const transport: SyncTransport = {
      push: vi.fn().mockResolvedValue({ acked: [] }),
      pull: vi.fn().mockResolvedValue({ entries: [], cursor: 0 }),
    };

    renderHook(bundle, transport);
    await act(async () => {});
    expect(transport.pull).not.toHaveBeenCalled();

    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(transport.pull).toHaveBeenCalledTimes(1);
  });

  it('(7) swallows a throwing transport and the next trigger still runs', async () => {
    hoisted.authState.isAuthenticated = true;
    const { bundle } = makeBundle();
    const pull = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({ entries: [], cursor: 0 });
    const transport: SyncTransport = { push: vi.fn().mockResolvedValue({ acked: [] }), pull };

    renderHook(bundle, transport);
    // First run rejects — must be swallowed (no unhandled rejection).
    await act(async () => {});
    expect(pull).toHaveBeenCalledTimes(1);

    // Next trigger still runs.
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(pull).toHaveBeenCalledTimes(2);
  });

  it('(8) drives a real push + pull + furthest-page correction through the fake transport + MemoryRepository', async () => {
    hoisted.authState.isAuthenticated = true;
    const { bundle, store } = makeBundle();

    // Seed: a local outbox entry (to be pushed) and a local reading-position
    // ahead on page (to trigger the furthest-page correction on pull).
    const localPos = makeReadingPosition({
      id: 'pos-1',
      page: 10,
      offset: 0,
      hlc: { wall: 1000, counter: 1, node: 'node-a' },
    });
    await store.put('reading-positions', localPos);
    await store.enqueue(
      makeOutboxEntry({
        id: 'ob-1',
        hlc: { wall: 1000, counter: 1, node: 'node-a' },
        collection: 'reading-positions',
        recordId: 'pos-1',
        op: 'put',
        payload: localPos,
      }),
    );

    // Remote: same record, LOWER page but HIGHER hlc → applyPull yields 'correct'.
    const remoteHlc: Hlc = { wall: 2000, counter: 0, node: 'node-b' };
    const remoteEntry: RemoteEntry = {
      collection: 'reading-positions',
      recordId: 'pos-1',
      hlc: encode(remoteHlc),
      op: 'put',
      payload: { id: 'pos-1', page: 5, offset: 0, hlc: encode(remoteHlc) },
      serverSeq: 1,
    };

    const pushed: OutboxEntry[][] = [];
    let pulledOnce = false;
    const transport: SyncTransport = {
      push: vi.fn().mockImplementation(async (entries: OutboxEntry[]) => {
        pushed.push(entries);
        return { acked: entries.map((e) => e.id) };
      }),
      pull: vi.fn().mockImplementation(async () => {
        if (pulledOnce) return { entries: [], cursor: 1 };
        pulledOnce = true;
        return { entries: [remoteEntry], cursor: 1 };
      }),
    };

    renderHook(bundle, transport);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Push shipped the seeded outbox entry.
    expect(pushed[0]?.[0]?.id).toBe('ob-1');
    // Outbox now also holds the furthest-page corrective entry (page 10 winner).
    const outbox = await store.unacked();
    const corrective = outbox.find((e) => e.recordId === 'pos-1');
    expect(corrective).toBeDefined();
    expect((corrective?.payload as { page: number }).page).toBe(10);
    // Local record keeps the furthest page (10), not the remote's 5.
    const finalPos = await store.get<{ id: string; page: number }>('reading-positions', 'pos-1');
    expect(finalPos?.page).toBe(10);
    // Cursor was persisted.
    const cursor = await store.get<{ id: string; seq: number }>(SYNC_META_COLLECTION, PULL_CURSOR_ID);
    expect(cursor?.seq).toBe(1);
  });
});
