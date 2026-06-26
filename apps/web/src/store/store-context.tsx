import { createContext, useContext, useMemo } from 'react';

import type { BlobBytes, BlobStatusStore, Hlc, SyncStore } from '@ember/core';
import { DexieRepository } from '@ember/store';

import { createSyncSignal } from '../sync/mutation-signal.js';
import type { SyncSignal } from '../sync/mutation-signal.js';
import { withMutationNotify } from '../sync/with-mutation-notify.js';

import { OpfsBlobStore } from './opfs-blob-store.js';
import { subtleCryptoHasher } from './subtle-crypto-hasher.js';
import { createWebClock } from './web-clock.js';
import { createWebStore } from './web-store.js';
import type { WebStore } from './web-store.js';

// ── Sync bundle ─────────────────────────────────────────────────────────────
// The shared ports the reconciler + blob-sync hook need, built from the SAME
// repo + clock the WebStore uses (single HLC source + single outbox). Null when
// a store is injected (tests / non-production), so both schedulers tear down.

export interface SyncBundle {
  /** Structural SyncStore — the same repo instance the WebStore appends to. */
  store: SyncStore;
  /** ReconcilerClock adapter over the shared WebClock. */
  clock: { tick: () => Hlc; receive: (remote: Hlc) => Hlc };
  /** Fresh outbox id (shared id source). */
  newOutboxId: () => string;
  /** Wake signal fired on every local outbox append. */
  signal: SyncSignal;
  /**
   * The local OpfsBlobStore instance — satisfies BlobBytes (has/get/put).
   * Bytes only move in/out of this local store (invariant #1).
   */
  blobs: BlobBytes;
  /**
   * The same repo instance cast as BlobStatusStore — satisfies get/put/delete
   * structurally. Status records are written via put/delete (no notify, no
   * enqueue) and are local-only / never pushed (invariant #2).
   */
  blobStatus: BlobStatusStore;
  /**
   * Local UI-refresh signal fired by the blob-sync scheduler after each pass.
   * Distinct from `signal` (the reconciler wake) — blob-status writes never
   * enqueue/notify the outbox (invariant #2), so the library UI has no other way
   * to learn a row's sync badge changed. Purely local: no enqueue, never pushed.
   */
  blobChange: SyncSignal;
}

// ── Context ───────────────────────────────────────────────────────────────────

const StoreContext = createContext<WebStore | null>(null);

/**
 * Carries the shared sync ports. Exported so tests can supply a fake bundle
 * directly without instantiating a production store.
 */
export const SyncBundleContext = createContext<SyncBundle | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

interface StoreProviderProps {
  children: React.ReactNode;
  /** Injected store for tests; production omits this prop. */
  store?: WebStore;
}

export function StoreProvider({ children, store }: StoreProviderProps) {
  // When an injected store is provided (e.g. in tests), skip production
  // instantiation entirely so jsdom never touches OPFS/IndexedDB. The sync
  // bundle is null in that case so the reconciler stays torn down.
  const built = useMemo(() => {
    if (store !== undefined) return { store: null, bundle: null };

    const webClock = createWebClock();
    const signal = createSyncSignal();
    const blobChange = createSyncSignal();
    const repo = withMutationNotify(new DexieRepository('ember'), signal.notify);
    const opfsBlobs = new OpfsBlobStore();
    const webStore = createWebStore({
      repo,
      blobs: opfsBlobs,
      hasher: subtleCryptoHasher,
      clock: webClock,
    });
    const bundle: SyncBundle = {
      store: repo,
      clock: {
        tick: () => webClock.nextStamp(),
        receive: (remote: Hlc) => webClock.receive(remote),
      },
      newOutboxId: () => webClock.newOutboxId(),
      signal,
      // Blob-sync ports: same instances, no new stores.
      blobs: opfsBlobs,
      blobStatus: repo,
      blobChange,
    };
    return { store: webStore, bundle };
    // store identity is stable at mount — intentionally excluded from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = store ?? (built.store as WebStore);

  return (
    <StoreContext.Provider value={value}>
      <SyncBundleContext.Provider value={built.bundle}>{children}</SyncBundleContext.Provider>
    </StoreContext.Provider>
  );
}

// ── Hooks ───────────────────────────────────────────────────────────────────────

export function useWebStore(): WebStore {
  const ctx = useContext(StoreContext);
  if (ctx === null) {
    throw new Error('useWebStore must be used within a StoreProvider');
  }
  return ctx;
}

/** The shared sync ports, or null when no production store was instantiated. */
export function useSyncBundle(): SyncBundle | null {
  return useContext(SyncBundleContext);
}
