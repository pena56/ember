import { createContext, useContext, useMemo } from 'react';

import type { Hlc, SyncStore } from '@ember/core';
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
// The shared ports the reconciler needs, built from the SAME repo + clock the
// WebStore uses (single HLC source + single outbox). Null when a store is
// injected (tests / non-production), so the reconciler tears down.

export interface SyncBundle {
  /** Structural SyncStore — the same repo instance the WebStore appends to. */
  store: SyncStore;
  /** ReconcilerClock adapter over the shared WebClock. */
  clock: { tick: () => Hlc; receive: (remote: Hlc) => Hlc };
  /** Fresh outbox id (shared id source). */
  newOutboxId: () => string;
  /** Wake signal fired on every local outbox append. */
  signal: SyncSignal;
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
    const repo = withMutationNotify(new DexieRepository('ember'), signal.notify);
    const webStore = createWebStore({
      repo,
      blobs: new OpfsBlobStore(),
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
