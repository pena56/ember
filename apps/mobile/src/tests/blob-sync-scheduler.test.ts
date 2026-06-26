/**
 * blob-sync-scheduler.test.ts — pure, injectable blob-sync scheduler (node env).
 *
 * Mirrors sync-scheduler.test.ts but for the blob-sync scheduler.
 * Uses in-memory fakes for transport/crypto/blobs/status — NO @ember/store import.
 *
 * Scenarios:
 *   (1) runs once immediately on construct (auth-ready)
 *   (2) signal.notify() schedules a debounced run
 *   (3) the interval fires runs
 *   (4) overlap guard — exactly one trailing run, never concurrent
 *   (5) offline-skip; reconnect triggers a run
 *   (6) appState active triggers; background does not
 *   (7) error-swallow: throwing runOnce swallowed; next trigger still runs
 *   (8) dispose() clears interval, removes subscriptions, cancels debounce
 *   (9) over-cap pre-skip: doc with byteSize > fileCap is pre-marked + excluded from candidateIds
 *  (10) blobChange fired after each pass (incl. on swallowed failure)
 *  (11) retryDeferred triggers a pass with retryDeferred=true
 *  (12) teardown: scheduler torn down on dispose, no further runs
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BlobStatus, BlobTransport, BlobBytes, CryptoBox } from '@ember/core';
import { BLOB_SYNC_COLLECTION } from '@ember/core';

import { createBlobSyncScheduler } from '../sync/blob-sync-scheduler.js';
import { createSyncSignal } from '../sync/mutation-signal.js';
import type { AppStateLike, NetworkLike } from '../sync/sync-scheduler.js';

// ── Fakes ──────────────────────────────────────────────────────────────────────

function fakeAppState(): {
  appState: AppStateLike;
  emit: (state: string) => void;
  remove: ReturnType<typeof vi.fn>;
} {
  let handler: ((state: string) => void) | undefined;
  const remove = vi.fn(() => { handler = undefined; });
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
  const remove = vi.fn(() => { handler = undefined; });
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

/** Minimal in-memory BlobStatusStore (structural, no @ember/store). */
function makeBlobStatus() {
  const store = new Map<string, BlobStatus>();
  return {
    async get<T extends { id: string }>(collection: string, id: string): Promise<T | undefined> {
      if (collection !== BLOB_SYNC_COLLECTION) return undefined;
      return store.get(id) as T | undefined;
    },
    async put<T extends { id: string }>(collection: string, record: T): Promise<void> {
      if (collection !== BLOB_SYNC_COLLECTION) return;
      store.set(record.id, record as unknown as BlobStatus);
    },
    async delete(collection: string, id: string): Promise<void> {
      if (collection !== BLOB_SYNC_COLLECTION) return;
      store.delete(id);
    },
    _store: store,
  };
}

/** Minimal in-memory BlobBytes. */
function makeBlobs(): BlobBytes & { _store: Map<string, Uint8Array> } {
  const store = new Map<string, Uint8Array>();
  return {
    async has(id) { return store.has(id); },
    async get(id) { return store.get(id); },
    async put(id, bytes) { store.set(id, bytes); },
    _store: store,
  };
}

/** No-op crypto box (tests don't need real encryption). */
const fakeCrypto: CryptoBox = {
  encrypt: async (p) => p,
  decrypt: async (c) => c,
};

/** No-op transport (tests control behavior via reconcileBlobs mock). */
const fakeTransport: BlobTransport = {
  upload: async () => ({ storageId: 'fake' }),
  saveBlob: async () => ({ ok: true }),
  download: async () => null,
  deleteBlob: async () => undefined,
};

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

interface SetupOpts {
  fileCap?: number;
  intervalMs?: number;
  debounceMs?: number;
  isOnline?: () => Promise<boolean>;
  listDocuments?: () => Promise<{ id: string; byteSize: number }[]>;
  runOnceOverride?: () => Promise<void>;
}

function setup(opts: SetupOpts = {}) {
  const signal = createSyncSignal();
  const blobChange = createSyncSignal();
  const app = fakeAppState();
  const net = fakeNetwork();
  const blobStatus = makeBlobStatus();
  const blobs = makeBlobs();

  const isOnline = opts.isOnline ?? vi.fn().mockResolvedValue(true);

  // listDocuments defaults to returning one doc with byteSize=100
  const listDocuments = opts.listDocuments ?? vi.fn().mockResolvedValue([{ id: 'doc-1', byteSize: 100 }]);

  const reconcileBlobs = vi.fn().mockResolvedValue({ uploaded: 0, downloaded: 0, deferred: 0, failed: 0 });

  const scheduler = createBlobSyncScheduler({
    listDocuments,
    reconcileBlobs,
    blobs,
    transport: fakeTransport,
    crypto: fakeCrypto,
    blobStatus,
    blobChange,
    isOnline,
    signal,
    appState: app.appState,
    network: net.network,
    fileCap: opts.fileCap,
    ...(opts.intervalMs !== undefined ? { intervalMs: opts.intervalMs } : {}),
    ...(opts.debounceMs !== undefined ? { debounceMs: opts.debounceMs } : {}),
  });

  return { scheduler, signal, blobChange, app, net, isOnline, listDocuments, reconcileBlobs, blobStatus, blobs };
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

describe('createBlobSyncScheduler', () => {
  it('(1) runs reconcileBlobs once immediately on construct', async () => {
    const { reconcileBlobs, scheduler } = setup();
    await flush();
    expect(reconcileBlobs).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });

  it('(2) signal.notify() schedules a debounced run', async () => {
    const { reconcileBlobs, signal, scheduler } = setup({ debounceMs: 200 });
    await flush();
    (reconcileBlobs as ReturnType<typeof vi.fn>).mockClear();

    signal.notify();
    signal.notify();
    expect(reconcileBlobs).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);
    expect(reconcileBlobs).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });

  it('(3) the interval fires runs', async () => {
    const { reconcileBlobs, scheduler } = setup({ intervalMs: 1000 });
    await flush();
    const baseline = (reconcileBlobs as ReturnType<typeof vi.fn>).mock.calls.length;

    await vi.advanceTimersByTimeAsync(1000);
    expect((reconcileBlobs as ReturnType<typeof vi.fn>).mock.calls.length).toBe(baseline + 1);

    await vi.advanceTimersByTimeAsync(1000);
    expect((reconcileBlobs as ReturnType<typeof vi.fn>).mock.calls.length).toBe(baseline + 2);
    scheduler.dispose();
  });

  it('(4) overlap guard — never two runs at once, exactly one trailing', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    let resolveCurrent: (() => void) | undefined;

    const reconcileBlobs = vi.fn().mockImplementation(async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise<void>((resolve) => { resolveCurrent = resolve; });
      concurrent -= 1;
      return { uploaded: 0, downloaded: 0, deferred: 0, failed: 0 };
    });

    const signal = createSyncSignal();
    const blobChange = createSyncSignal();
    const app = fakeAppState();
    const net = fakeNetwork();
    const blobStatus = makeBlobStatus();
    const blobs = makeBlobs();

    const scheduler = createBlobSyncScheduler({
      listDocuments: vi.fn().mockResolvedValue([{ id: 'doc-1', byteSize: 100 }]),
      reconcileBlobs,
      blobs,
      transport: fakeTransport,
      crypto: fakeCrypto,
      blobStatus,
      blobChange,
      isOnline: vi.fn().mockResolvedValue(true),
      signal,
      appState: app.appState,
      network: net.network,
    });

    // Let the initial run start and block.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(reconcileBlobs).toHaveBeenCalledTimes(1);

    // Fire more triggers while in-flight — they should coalesce.
    signal.notify();
    app.emit('active');

    // Release the in-flight run.
    resolveCurrent?.();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    resolveCurrent?.();
    await Promise.resolve();

    expect(maxConcurrent).toBe(1);
    expect(reconcileBlobs).toHaveBeenCalledTimes(2);
    scheduler.dispose();
  });

  it('(5) offline-skip; reconnect triggers a run', async () => {
    const isOnline = vi.fn().mockResolvedValue(false);
    const { reconcileBlobs, net, scheduler } = setup({ isOnline });
    await flush();
    expect(reconcileBlobs).not.toHaveBeenCalled();

    // Disconnected event does not trigger.
    net.emit({ isConnected: false });
    await flush();
    expect(reconcileBlobs).not.toHaveBeenCalled();

    // Back online.
    isOnline.mockResolvedValue(true);
    net.emit({ isConnected: true });
    await flush();
    expect(reconcileBlobs).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });

  it('(6) appState active triggers a run; background does not', async () => {
    const { reconcileBlobs, app, scheduler } = setup();
    await flush();
    (reconcileBlobs as ReturnType<typeof vi.fn>).mockClear();

    app.emit('background');
    await flush();
    expect(reconcileBlobs).not.toHaveBeenCalled();

    app.emit('active');
    await flush();
    expect(reconcileBlobs).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });

  it('(7) swallows a throwing reconcileBlobs; next trigger still runs', async () => {
    const reconcileBlobs = vi
      .fn()
      .mockRejectedValueOnce(new Error('network failure'))
      .mockResolvedValue({ uploaded: 0, downloaded: 0, deferred: 0, failed: 0 });

    const signal = createSyncSignal();
    const blobChange = createSyncSignal();
    const app = fakeAppState();
    const net = fakeNetwork();
    const blobStatus = makeBlobStatus();
    const blobs = makeBlobs();

    const scheduler = createBlobSyncScheduler({
      listDocuments: vi.fn().mockResolvedValue([{ id: 'd1', byteSize: 100 }]),
      reconcileBlobs,
      blobs,
      transport: fakeTransport,
      crypto: fakeCrypto,
      blobStatus,
      blobChange,
      isOnline: vi.fn().mockResolvedValue(true),
      signal,
      appState: app.appState,
      network: net.network,
    });

    await flush();
    expect(reconcileBlobs).toHaveBeenCalledTimes(1);

    app.emit('active');
    await flush();
    expect(reconcileBlobs).toHaveBeenCalledTimes(2);
    scheduler.dispose();
  });

  it('(8) dispose() clears interval, removes subscriptions, cancels debounce', async () => {
    const { reconcileBlobs, signal, app, net, scheduler } = setup({ intervalMs: 1000 });
    await flush();
    const baseline = (reconcileBlobs as ReturnType<typeof vi.fn>).mock.calls.length;

    signal.notify();
    scheduler.dispose();

    expect(app.remove).toHaveBeenCalledTimes(1);
    expect(net.remove).toHaveBeenCalledTimes(1);

    // No further runs.
    await vi.advanceTimersByTimeAsync(5000);
    app.emit('active');
    net.emit({ isConnected: true });
    signal.notify();
    await vi.advanceTimersByTimeAsync(5000);

    expect((reconcileBlobs as ReturnType<typeof vi.fn>).mock.calls.length).toBe(baseline);
  });

  it('(9) over-cap pre-skip: doc with byteSize > fileCap is pre-marked deferred/over-file-cap and excluded from candidateIds', async () => {
    const LARGE_DOC = { id: 'large-doc', byteSize: 60_000_000 };
    const SMALL_DOC = { id: 'small-doc', byteSize: 10_000_000 };
    const FILE_CAP = 50_000_000;

    const reconcileBlobs = vi.fn().mockResolvedValue({ uploaded: 0, downloaded: 0, deferred: 0, failed: 0 });
    const signal = createSyncSignal();
    const blobChange = createSyncSignal();
    const app = fakeAppState();
    const net = fakeNetwork();
    const blobStatus = makeBlobStatus();
    const blobs = makeBlobs();

    const scheduler = createBlobSyncScheduler({
      listDocuments: vi.fn().mockResolvedValue([LARGE_DOC, SMALL_DOC]),
      reconcileBlobs,
      blobs,
      transport: fakeTransport,
      crypto: fakeCrypto,
      blobStatus,
      blobChange,
      isOnline: vi.fn().mockResolvedValue(true),
      signal,
      appState: app.appState,
      network: net.network,
      fileCap: FILE_CAP,
    });

    await flush();

    // reconcileBlobs must have been called with candidateIds excluding large-doc.
    expect(reconcileBlobs).toHaveBeenCalledTimes(1);
    const callArgs = (reconcileBlobs as ReturnType<typeof vi.fn>).mock.calls[0] as [{ candidateIds: string[] }];
    expect(callArgs[0].candidateIds).not.toContain('large-doc');
    expect(callArgs[0].candidateIds).toContain('small-doc');

    // large-doc must be pre-marked as deferred/over-file-cap in blobStatus.
    const largeStatus = await blobStatus.get<{ id: string; status: string; code: string }>(
      BLOB_SYNC_COLLECTION,
      'large-doc',
    );
    expect(largeStatus).toEqual({ id: 'large-doc', status: 'deferred', code: 'over-file-cap' });

    scheduler.dispose();
  });

  it('(9b) over-cap pre-skip applies even on retryDeferred pass', async () => {
    const LARGE_DOC = { id: 'over-cap-doc', byteSize: 100_000_000 };
    const FILE_CAP = 50_000_000;

    const reconcileBlobs = vi.fn().mockResolvedValue({ uploaded: 0, downloaded: 0, deferred: 0, failed: 0 });
    const signal = createSyncSignal();
    const blobChange = createSyncSignal();
    const app = fakeAppState();
    const net = fakeNetwork();
    const blobStatus = makeBlobStatus();
    const blobs = makeBlobs();

    const scheduler = createBlobSyncScheduler({
      listDocuments: vi.fn().mockResolvedValue([LARGE_DOC]),
      reconcileBlobs,
      blobs,
      transport: fakeTransport,
      crypto: fakeCrypto,
      blobStatus,
      blobChange,
      isOnline: vi.fn().mockResolvedValue(true),
      signal,
      appState: app.appState,
      network: net.network,
      fileCap: FILE_CAP,
    });

    await flush();

    // retryDeferred pass.
    await scheduler.run(true);

    // Still excluded — an over-cap file can never shrink.
    const calls = (reconcileBlobs as ReturnType<typeof vi.fn>).mock.calls as [{ candidateIds: string[] }][];
    for (const [args] of calls) {
      expect(args.candidateIds).not.toContain('over-cap-doc');
    }

    scheduler.dispose();
  });

  it('(10) blobChange is fired after each pass (including on swallowed failure)', async () => {
    const blobChangeNotify = vi.fn();
    const signal = createSyncSignal();
    const blobChange = {
      notify: blobChangeNotify,
      subscribe: (_cb: () => void) => () => undefined,
    };
    const app = fakeAppState();
    const net = fakeNetwork();
    const blobStatus = makeBlobStatus();
    const blobs = makeBlobs();

    // First call throws, second resolves.
    const reconcileBlobs = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({ uploaded: 0, downloaded: 0, deferred: 0, failed: 0 });

    const scheduler = createBlobSyncScheduler({
      listDocuments: vi.fn().mockResolvedValue([{ id: 'doc-x', byteSize: 100 }]),
      reconcileBlobs,
      blobs,
      transport: fakeTransport,
      crypto: fakeCrypto,
      blobStatus,
      blobChange,
      isOnline: vi.fn().mockResolvedValue(true),
      signal,
      appState: app.appState,
      network: net.network,
    });

    // First pass (throws, swallowed) — blobChange must still fire.
    await flush();
    expect(blobChangeNotify).toHaveBeenCalledTimes(1);

    // Second pass (succeeds) — blobChange fires again.
    app.emit('active');
    await flush();
    expect(blobChangeNotify).toHaveBeenCalledTimes(2);

    scheduler.dispose();
  });

  it('(11) retryDeferred: run(true) passes retryDeferred=true to reconcileBlobs', async () => {
    const reconcileBlobs = vi.fn().mockResolvedValue({ uploaded: 0, downloaded: 0, deferred: 0, failed: 0 });
    const signal = createSyncSignal();
    const blobChange = createSyncSignal();
    const app = fakeAppState();
    const net = fakeNetwork();
    const blobStatus = makeBlobStatus();
    const blobs = makeBlobs();

    const scheduler = createBlobSyncScheduler({
      listDocuments: vi.fn().mockResolvedValue([{ id: 'doc-r', byteSize: 100 }]),
      reconcileBlobs,
      blobs,
      transport: fakeTransport,
      crypto: fakeCrypto,
      blobStatus,
      blobChange,
      isOnline: vi.fn().mockResolvedValue(true),
      signal,
      appState: app.appState,
      network: net.network,
    });

    await flush();
    (reconcileBlobs as ReturnType<typeof vi.fn>).mockClear();

    // Call run(true) for the retryDeferred path.
    await scheduler.run(true);

    expect(reconcileBlobs).toHaveBeenCalledTimes(1);
    const callArgs = (reconcileBlobs as ReturnType<typeof vi.fn>).mock.calls[0] as [{ retryDeferred: boolean }];
    expect(callArgs[0].retryDeferred).toBe(true);

    scheduler.dispose();
  });

  it('(12) teardown: no runs after dispose', async () => {
    const { reconcileBlobs, scheduler } = setup({ intervalMs: 500 });
    await flush();
    scheduler.dispose();
    const baseline = (reconcileBlobs as ReturnType<typeof vi.fn>).mock.calls.length;

    await vi.advanceTimersByTimeAsync(2000);
    expect((reconcileBlobs as ReturnType<typeof vi.fn>).mock.calls.length).toBe(baseline);
  });
});
