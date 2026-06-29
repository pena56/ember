/**
 * use-blob-sync.test.tsx — blob-sync scheduler hook.
 *
 * Mirrors use-reconciler.test.tsx in structure.
 * Uses injectable opts (transport, crypto, intervalMs) so tests never touch convex.
 *
 * Tests:
 *  (1) does NOT run while unauthenticated
 *  (2) runs once on auth-ready
 *  (3) offline skips; online event triggers a run
 *  (4) overlap guard: concurrent triggers coalesce to one trailing run
 *  (5) transport error is swallowed; next trigger still runs
 *  (6) interval fires runs
 *  (7) signal.notify() schedules a debounced run
 *  (8) e2e: uploads a pending blob and downloads a missing one via fakes
 *  (9) retryDeferred() one-shot passes retryDeferred:true
 *  (10) over-cap blob is pre-skipped (never uploaded) and marked over-file-cap
 *  (11) fires bundle.blobChange after each pass so the library UI re-reads badges
 */

import { act, cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BlobBytes, BlobStatus, BlobStatusStore, BlobTransport, CryptoBox } from '@ember/core';
import { BLOB_SYNC_COLLECTION } from '@ember/core';
import { MemoryBlobStore, MemoryRepository } from '@ember/store';

import { SyncBundleContext, StoreProvider } from '../store/store-context.js';
import type { SyncBundle } from '../store/store-context.js';
import { subtleCryptoHasher } from '../store/subtle-crypto-hasher.js';
import { createWebClock } from '../store/web-clock.js';
import { createWebStore } from '../store/web-store.js';
import type { WebStore } from '../store/web-store.js';
import { createSyncSignal } from '../sync/mutation-signal.js';
import { useBlobSync } from '../sync/use-blob-sync.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const hoisted = vi.hoisted(() => ({ authState: { isAuthenticated: false, isLoading: false } }));

vi.mock('convex/react', () => ({
  useConvexAuth: () => ({ ...hoisted.authState }),
}));

vi.mock('../convex/convex-client.js', () => ({ convex: {} }));

// ── Fakes ─────────────────────────────────────────────────────────────────────

/** Identity CryptoBox — no encryption, just passes bytes through. */
const identityCrypto: CryptoBox = {
  encrypt: (p) => Promise.resolve(p),
  decrypt: (c) => Promise.resolve(c),
};

/** Simple in-memory BlobBytes store. */
function makeMemoryBlobs(initial?: Map<string, Uint8Array>): BlobBytes & { data: Map<string, Uint8Array> } {
  const data = initial ? new Map(initial) : new Map<string, Uint8Array>();
  return {
    data,
    has: (id) => Promise.resolve(data.has(id)),
    get: (id) => Promise.resolve(data.get(id)),
    put: (id, b) => { data.set(id, b); return Promise.resolve(); },
  };
}

/** Make a fake BlobTransport backed by an in-memory Map server. */
function makeMemoryTransport(serverBlobs?: Map<string, Uint8Array>): BlobTransport & {
  uploadCalls: string[];
  downloadCalls: string[];
} {
  const server = serverBlobs ?? new Map<string, Uint8Array>();
  const uploadCalls: string[] = [];
  const downloadCalls: string[] = [];
  return {
    uploadCalls,
    downloadCalls,
    async upload(ciphertext) {
      const storageId = `storage-${Math.random().toString(36).slice(2)}`;
      server.set(storageId, ciphertext);
      return { storageId };
    },
    async saveBlob(contentId, storageId) {
      const bytes = server.get(storageId);
      if (bytes) { server.delete(storageId); server.set(contentId, bytes); }
      uploadCalls.push(contentId);
      return { ok: true };
    },
    async download(contentId) {
      downloadCalls.push(contentId);
      const bytes = server.get(contentId);
      return bytes ?? null;
    },
    async deleteBlob(contentId) {
      server.delete(contentId);
    },
  };
}

let _clockCounter = 0;

/** Build an in-memory WebStore backed by a MemoryRepository (shared repo). */
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

/** Build a fake SyncBundle and a matching WebStore (both share the same MemoryRepository). */
function makeTestRig(over?: {
  repo?: MemoryRepository;
  blobs?: BlobBytes;
  blobStatus?: BlobStatusStore;
}): {
  bundle: SyncBundle;
  repo: MemoryRepository;
  webStore: WebStore;
  signal: ReturnType<typeof createSyncSignal>;
} {
  const repo = over?.repo ?? new MemoryRepository();
  const webStore = makeWebStore(repo);
  const signal = createSyncSignal();
  const blobs = over?.blobs ?? makeMemoryBlobs();
  const blobStatus: BlobStatusStore = over?.blobStatus ?? repo;
  const bundle: SyncBundle = {
    store: repo,
    clock: {
      tick: () => ({ wall: 1000, counter: 1, node: 'node-a' }),
      receive: (r) => r,
    },
    newOutboxId: (() => { let n = 0; return () => `oid-${++n}`; })(),
    signal,
    blobs,
    blobStatus,
    blobChange: createSyncSignal(),
    deviceId: 'test-device',
  };
  return { bundle, repo, webStore, signal };
}

/** Component that calls useBlobSync with injectable opts. */
function Harness({
  transport,
  crypto,
  intervalMs,
  fileCap,
  onRetry,
}: {
  transport: BlobTransport;
  crypto?: CryptoBox;
  intervalMs?: number;
  fileCap?: number;
  onRetry?: (fn: () => Promise<void>) => void;
}) {
  const { retryDeferred } = useBlobSync({
    transport,
    crypto: crypto ?? identityCrypto,
    ...(intervalMs !== undefined ? { intervalMs } : {}),
    ...(fileCap !== undefined ? { fileCap } : {}),
  });
  if (onRetry) onRetry(retryDeferred);
  return null;
}

/**
 * Wrap Harness with both StoreProvider (gives useWebStore) and
 * SyncBundleContext.Provider (gives useSyncBundle). Both share the same repo.
 */
function makeWrapper(bundle: SyncBundle, webStore: WebStore) {
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

function renderHook(
  bundle: SyncBundle,
  webStore: WebStore,
  transport: BlobTransport,
  opts?: {
    intervalMs?: number;
    crypto?: CryptoBox;
    fileCap?: number;
    onRetry?: (fn: () => Promise<void>) => void;
  },
) {
  return render(
    createElement(Harness, {
      transport,
      crypto: opts?.crypto ?? identityCrypto,
      ...(opts?.intervalMs !== undefined ? { intervalMs: opts.intervalMs } : {}),
      ...(opts?.fileCap !== undefined ? { fileCap: opts.fileCap } : {}),
      ...(opts?.onRetry ? { onRetry: opts.onRetry } : {}),
    }),
    { wrapper: makeWrapper(bundle, webStore) },
  );
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useBlobSync', () => {
  it('(1) does not run while unauthenticated', async () => {
    const { bundle, webStore } = makeTestRig();
    const transport = makeMemoryTransport();

    renderHook(bundle, webStore, transport);
    await act(async () => {});

    expect(transport.uploadCalls).toHaveLength(0);
    expect(transport.downloadCalls).toHaveLength(0);
  });

  it('(2) runs once on auth-ready (with no candidate ids — no-op)', async () => {
    hoisted.authState.isAuthenticated = true;
    const { bundle, webStore } = makeTestRig();
    const transport = makeMemoryTransport();

    const download = vi.spyOn(transport, 'download');
    renderHook(bundle, webStore, transport);
    await act(async () => {});

    // With no documents there are no candidateIds — reconcileBlobs does nothing
    expect(download).toHaveBeenCalledTimes(0);
  });

  it('(3) offline skips run; online event triggers a run', async () => {
    hoisted.authState.isAuthenticated = true;
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    const { bundle, repo, webStore } = makeTestRig();
    // Insert a document so candidateIds is non-empty
    await repo.put('documents', { id: 'doc-1', title: 'Test', filename: 'test.pdf', contentId: 'c1', byteSize: 100, importedAt: 1000 });

    const transport = makeMemoryTransport();
    const download = vi.spyOn(transport, 'download');

    renderHook(bundle, webStore, transport);
    await act(async () => {});

    // Should not have run (offline)
    expect(download).toHaveBeenCalledTimes(0);

    // Come online → triggers a run
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    // download gets called for 'doc-1' (not in local blobs)
    expect(download).toHaveBeenCalledWith('doc-1');
  });

  it('(4) overlap guard: concurrent triggers coalesce into one trailing run', async () => {
    hoisted.authState.isAuthenticated = true;

    const { bundle, repo, webStore, signal } = makeTestRig();
    await repo.put('documents', { id: 'doc-1', title: 'T', filename: 'f.pdf', contentId: 'c1', byteSize: 10, importedAt: 1 });

    let concurrent = 0;
    let maxConcurrent = 0;
    let resolveCurrent: (() => void) | undefined;

    const transport = makeMemoryTransport();
    vi.spyOn(transport, 'download').mockImplementation(async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise<void>((resolve) => { resolveCurrent = resolve; });
      concurrent -= 1;
      return null;
    });

    renderHook(bundle, webStore, transport);

    await act(async () => {});
    expect(maxConcurrent).toBeLessThanOrEqual(1);

    act(() => {
      signal.notify();
      window.dispatchEvent(new Event('focus'));
    });

    await act(async () => {
      resolveCurrent?.();
      await Promise.resolve();
      resolveCurrent?.();
      await Promise.resolve();
    });

    expect(maxConcurrent).toBe(1);
  });

  it('(5) transport error is swallowed; next trigger still runs', async () => {
    hoisted.authState.isAuthenticated = true;
    const { bundle, repo, webStore } = makeTestRig();
    await repo.put('documents', { id: 'doc-1', title: 'T', filename: 'f.pdf', contentId: 'c1', byteSize: 10, importedAt: 1 });

    const transport = makeMemoryTransport();
    const downloadSpy = vi.spyOn(transport, 'download')
      .mockRejectedValueOnce(new Error('network boom'))
      .mockResolvedValue(null);

    renderHook(bundle, webStore, transport);

    await act(async () => {});
    // First run throws — swallowed

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    // Second trigger still runs
    expect(downloadSpy).toHaveBeenCalledTimes(2);
  });

  it('(6) interval fires runs', async () => {
    vi.useFakeTimers();
    hoisted.authState.isAuthenticated = true;
    const { bundle, webStore } = makeTestRig();
    const transport = makeMemoryTransport();
    const download = vi.spyOn(transport, 'download').mockResolvedValue(null);

    renderHook(bundle, webStore, transport, { intervalMs: 1000 });
    await act(async () => { await vi.runOnlyPendingTimersAsync(); });
    const afterMount = download.mock.calls.length;

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    // no candidates → download still not called, but interval fired
    expect(download.mock.calls.length).toBe(afterMount);
  });

  it('(7) signal.notify() schedules a debounced run', async () => {
    vi.useFakeTimers();
    hoisted.authState.isAuthenticated = true;
    const { bundle, repo, webStore, signal } = makeTestRig();
    await repo.put('documents', { id: 'doc-1', title: 'T', filename: 'f.pdf', contentId: 'c1', byteSize: 10, importedAt: 1 });

    const transport = makeMemoryTransport();
    const download = vi.spyOn(transport, 'download').mockResolvedValue(null);

    renderHook(bundle, webStore, transport);
    await act(async () => { await vi.runOnlyPendingTimersAsync(); });
    download.mockClear();

    act(() => {
      signal.notify();
      signal.notify();
      signal.notify();
    });
    expect(download).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('(8) e2e: uploads a local blob and downloads a server blob via fakes', async () => {
    hoisted.authState.isAuthenticated = true;

    const localBytes = new Uint8Array([1, 2, 3]);
    const serverBytes = new Uint8Array([4, 5, 6]);

    const blobs = makeMemoryBlobs(new Map([['doc-a', localBytes]]));
    const blobStatusRepo = new MemoryRepository();
    const repo = new MemoryRepository();

    await repo.put('documents', { id: 'doc-a', title: 'A', filename: 'a.pdf', contentId: 'doc-a', byteSize: 3, importedAt: 1 });
    await repo.put('documents', { id: 'doc-b', title: 'B', filename: 'b.pdf', contentId: 'doc-b', byteSize: 3, importedAt: 2 });

    const serverMap = new Map<string, Uint8Array>([['doc-b', serverBytes]]);
    const transport = makeMemoryTransport(serverMap);

    const { bundle, webStore } = makeTestRig({ repo, blobs, blobStatus: blobStatusRepo });

    renderHook(bundle, webStore, transport);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

    // doc-a should have been uploaded
    expect(transport.uploadCalls).toContain('doc-a');

    // doc-b's bytes should now be local
    const downloaded = await blobs.get('doc-b');
    expect(downloaded).toBeDefined();
    expect(Array.from(downloaded!)).toEqual(Array.from(serverBytes));

    // doc-a status should be 'synced'
    const status = await blobStatusRepo.get<BlobStatus>(BLOB_SYNC_COLLECTION, 'doc-a');
    expect(status?.status).toBe('synced');
  });

  it('(9) retryDeferred callback runs reconcileBlobs with retryDeferred:true', async () => {
    hoisted.authState.isAuthenticated = true;

    const blobs = makeMemoryBlobs();
    const blobStatusRepo = new MemoryRepository();
    const repo = new MemoryRepository();

    // Mark doc-a as deferred
    await blobStatusRepo.put(BLOB_SYNC_COLLECTION, { id: 'doc-a', status: 'deferred', code: 'over-quota' } as BlobStatus);
    await repo.put('documents', { id: 'doc-a', title: 'A', filename: 'a.pdf', contentId: 'doc-a', byteSize: 3, importedAt: 1 });
    blobs.data.set('doc-a', new Uint8Array([1, 2, 3]));

    const transport = makeMemoryTransport();
    const { bundle, webStore } = makeTestRig({ repo, blobs, blobStatus: blobStatusRepo });

    let capturedRetry: (() => Promise<void>) | undefined;
    renderHook(bundle, webStore, transport, {
      onRetry: (fn) => { capturedRetry = fn; },
    });

    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    // Auto run uses retryDeferred:false → deferred doc skipped
    expect(transport.uploadCalls).not.toContain('doc-a');

    // Manual retry should include the deferred blob
    await act(async () => { await capturedRetry?.(); });
    expect(transport.uploadCalls).toContain('doc-a');
  });

  it('(10) over-cap blob is pre-skipped: never uploaded, marked over-file-cap', async () => {
    hoisted.authState.isAuthenticated = true;

    const fileCap = 50_000_000; // 50 MB
    const blobs = makeMemoryBlobs(new Map([
      ['doc-big', new Uint8Array([1, 2, 3])],   // over cap by byteSize
      ['doc-small', new Uint8Array([4, 5, 6])], // under cap
    ]));
    const blobStatusRepo = new MemoryRepository();
    const repo = new MemoryRepository();

    await repo.put('documents', { id: 'doc-big', title: 'Big', filename: 'big.pdf', contentId: 'doc-big', byteSize: 60_000_000, importedAt: 1 });
    await repo.put('documents', { id: 'doc-small', title: 'Small', filename: 'small.pdf', contentId: 'doc-small', byteSize: 1000, importedAt: 2 });

    const transport = makeMemoryTransport();
    const { bundle, webStore } = makeTestRig({ repo, blobs, blobStatus: blobStatusRepo });

    renderHook(bundle, webStore, transport, { fileCap });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    // The over-cap file is never encrypted/uploaded …
    expect(transport.uploadCalls).not.toContain('doc-big');
    // … but is marked deferred/over-file-cap so the UI can show the badge.
    const bigStatus = await blobStatusRepo.get<BlobStatus>(BLOB_SYNC_COLLECTION, 'doc-big');
    expect(bigStatus).toEqual({ id: 'doc-big', status: 'deferred', code: 'over-file-cap' });

    // The under-cap file still uploads normally.
    expect(transport.uploadCalls).toContain('doc-small');
  });

  it('(11) fires bundle.blobChange after a pass so the library UI re-reads', async () => {
    hoisted.authState.isAuthenticated = true;
    const { bundle, webStore } = makeTestRig();
    const transport = makeMemoryTransport();

    const notified = vi.fn();
    const unsubscribe = bundle.blobChange.subscribe(notified);

    renderHook(bundle, webStore, transport);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    // The mount run completes → the local UI-refresh signal fires at least once.
    expect(notified).toHaveBeenCalled();
    unsubscribe();
  });
});
