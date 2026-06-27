/**
 * sync-scheduler.test.ts — the pure, injectable scheduler (node, no React).
 *
 * Constructs createSyncScheduler with a spy runOnce, a fake async isOnline, a
 * real createSyncSignal, and fake appState/network (objects whose
 * addEventListener / addNetworkStateListener capture the handler and return a
 * { remove } spy). Drives the overlap-guarded, trailing-coalescing run loop with
 * fake timers.
 *
 * Scenarios (mirrors 12c's use-reconciler suite, adapted to injected ports):
 *   (1) one runOnce immediately on construct (auth-ready)
 *   (2) signal.notify() schedules a debounced run
 *   (3) the interval fires runs
 *   (4) overlap guard — exactly one trailing run, never concurrent
 *   (5) offline skips; a network connected event triggers a run (disconnected does not)
 *   (6) an appState 'active' event triggers a run; a 'background' event does not
 *   (7) a throwing runOnce is swallowed; the next trigger still runs
 *   (8) dispose() clears interval, removes both subscriptions, cancels debounce
 *   (9) e2e wiring — real reconcile() over MemoryRepository + a fake transport
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  encode,
  makeOutboxEntry,
  makeReadingPosition,
  PULL_CURSOR_ID,
  reconcile,
  SYNC_META_COLLECTION,
} from '@ember/core';
import type { Hlc, OutboxEntry, RemoteEntry, SyncTransport } from '@ember/core';
import { MemoryRepository } from '@ember/store';

import { createSyncSignal } from '../sync/mutation-signal.js';
import { createSyncScheduler } from '../sync/sync-scheduler.js';
import type { AppStateLike, NetworkLike } from '../sync/sync-scheduler.js';

// ── Fakes ──────────────────────────────────────────────────────────────────────

function fakeAppState(): {
  appState: AppStateLike;
  emit: (state: string) => void;
  remove: ReturnType<typeof vi.fn>;
} {
  let handler: ((state: string) => void) | undefined;
  const remove = vi.fn(() => {
    handler = undefined;
  });
  return {
    appState: {
      addEventListener(_type, h) {
        handler = h;
        return { remove };
      },
    },
    emit: (state) => handler?.(state),
    remove,
  };
}

function fakeNetwork(): {
  network: NetworkLike;
  emit: (state: { isConnected?: boolean }) => void;
  remove: ReturnType<typeof vi.fn>;
} {
  let handler: ((state: { isConnected?: boolean }) => void) | undefined;
  const remove = vi.fn(() => {
    handler = undefined;
  });
  return {
    network: {
      addNetworkStateListener(h) {
        handler = h;
        return { remove };
      },
    },
    emit: (state) => handler?.(state),
    remove,
  };
}

/** Flush pending microtasks (the async run loop) without advancing fake timers.
 *  Iteration count is generous so the deepest path (scenario 9's e2e reconcile —
 *  push → pull → per-entry policy resolve → furthest-page corrective enqueue)
 *  fully settles; a too-tight drain reads the outbox before the corrective lands. */
async function flush(): Promise<void> {
  for (let i = 0; i < 24; i++) await Promise.resolve();
}

function setup(over?: {
  runOnce?: () => Promise<unknown>;
  isOnline?: () => Promise<boolean>;
  intervalMs?: number;
  debounceMs?: number;
}) {
  const signal = createSyncSignal();
  const app = fakeAppState();
  const net = fakeNetwork();
  const runOnce = over?.runOnce ?? vi.fn().mockResolvedValue(undefined);
  const isOnline = over?.isOnline ?? vi.fn().mockResolvedValue(true);
  const scheduler = createSyncScheduler({
    runOnce,
    isOnline,
    signal,
    appState: app.appState,
    network: net.network,
    ...(over?.intervalMs !== undefined ? { intervalMs: over.intervalMs } : {}),
    ...(over?.debounceMs !== undefined ? { debounceMs: over.debounceMs } : {}),
  });
  return { scheduler, signal, app, net, runOnce, isOnline };
}

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('createSyncScheduler', () => {
  it('(1) runs once immediately on construct', async () => {
    const { runOnce, scheduler } = setup();
    await flush();
    expect(runOnce).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });

  it('(2) signal.notify() schedules a debounced run', async () => {
    const { runOnce, signal, scheduler } = setup();
    await flush();
    (runOnce as ReturnType<typeof vi.fn>).mockClear();

    signal.notify();
    signal.notify();
    signal.notify();
    // Before the debounce window elapses: no run yet.
    expect(runOnce).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    expect(runOnce).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });

  it('(3) the interval fires runs', async () => {
    const { runOnce, scheduler } = setup({ intervalMs: 1000 });
    await flush();
    const after = (runOnce as ReturnType<typeof vi.fn>).mock.calls.length;

    await vi.advanceTimersByTimeAsync(1000);
    expect((runOnce as ReturnType<typeof vi.fn>).mock.calls.length).toBe(after + 1);

    await vi.advanceTimersByTimeAsync(1000);
    expect((runOnce as ReturnType<typeof vi.fn>).mock.calls.length).toBe(after + 2);
    scheduler.dispose();
  });

  it('(4) overlap guard coalesces concurrent triggers into one trailing run (never concurrent)', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    let resolveCurrent: (() => void) | undefined;

    const runOnce = vi.fn().mockImplementation(async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise<void>((resolve) => {
        resolveCurrent = resolve;
      });
      concurrent -= 1;
    });

    const { signal, app, scheduler } = setup({ runOnce });
    // Let the immediate run start and block inside runOnce.
    await Promise.resolve();
    await Promise.resolve();
    expect(runOnce).toHaveBeenCalledTimes(1);

    // While in-flight, fire several more triggers — they must coalesce.
    signal.notify();
    app.emit('active');
    app.emit('active');

    // Release the in-flight run; exactly one trailing pass should follow.
    resolveCurrent?.();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    resolveCurrent?.(); // release the trailing pass too
    await Promise.resolve();

    expect(maxConcurrent).toBe(1); // never two runs at once
    expect(runOnce).toHaveBeenCalledTimes(2); // initial + exactly one trailing
    scheduler.dispose();
  });

  it('(5) skips while offline; a network connected event triggers a run', async () => {
    const isOnline = vi.fn().mockResolvedValue(false);
    const { runOnce, net, scheduler } = setup({ isOnline });
    await flush();
    expect(runOnce).not.toHaveBeenCalled();

    // A disconnected event does NOT trigger a run.
    net.emit({ isConnected: false });
    await flush();
    expect(runOnce).not.toHaveBeenCalled();

    // Now back online; a connected event triggers a run.
    isOnline.mockResolvedValue(true);
    net.emit({ isConnected: true });
    await flush();
    expect(runOnce).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });

  it('(6) an appState active event triggers a run; background does not', async () => {
    const { runOnce, app, scheduler } = setup();
    await flush();
    (runOnce as ReturnType<typeof vi.fn>).mockClear();

    app.emit('background');
    await flush();
    expect(runOnce).not.toHaveBeenCalled();

    app.emit('active');
    await flush();
    expect(runOnce).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });

  it('(7) swallows a throwing runOnce; the next trigger still runs', async () => {
    const runOnce = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(undefined);
    const { app, scheduler } = setup({ runOnce });
    await flush();
    expect(runOnce).toHaveBeenCalledTimes(1);

    app.emit('active');
    await flush();
    expect(runOnce).toHaveBeenCalledTimes(2);
    scheduler.dispose();
  });

  it('(8) dispose() clears the interval, removes both subscriptions, cancels debounce, and stops runs', async () => {
    const { runOnce, signal, app, net, scheduler } = setup({ intervalMs: 1000 });
    await flush();
    const baseline = (runOnce as ReturnType<typeof vi.fn>).mock.calls.length;

    // Queue a debounced run, then dispose before it fires.
    signal.notify();
    scheduler.dispose();

    expect(app.remove).toHaveBeenCalledTimes(1);
    expect(net.remove).toHaveBeenCalledTimes(1);

    // No further runs from interval, debounce, or lifecycle events after dispose.
    await vi.advanceTimersByTimeAsync(5000);
    app.emit('active');
    net.emit({ isConnected: true });
    signal.notify();
    await vi.advanceTimersByTimeAsync(5000);

    expect((runOnce as ReturnType<typeof vi.fn>).mock.calls.length).toBe(baseline);
  });

  it('(9) drives a real push + pull + furthest-page correction through a fake transport + MemoryRepository', async () => {
    const store = new MemoryRepository();

    // A fake monotone clock — enough for reconcile's tick/receive.
    const state = { counter: 0 };
    const clock = {
      tick: (): Hlc => ({ wall: 1000, counter: ++state.counter, node: 'node-a' }),
      receive: (remote: Hlc): Hlc => {
        state.counter = Math.max(state.counter, remote.counter) + 1;
        return { wall: Math.max(1000, remote.wall), counter: state.counter, node: 'node-a' };
      },
    };
    let oid = 0;
    const newOutboxId = () => `oid-${++oid}`;

    // Seed: a local outbox entry (to push) + a local reading-position ahead on page.
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

    const scheduler = setup({
      runOnce: () => reconcile({ store, transport, clock, newOutboxId }),
    }).scheduler;

    await flush();

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

    scheduler.dispose();
  });
});
