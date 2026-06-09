import { createContext, useContext, useMemo } from 'react';

import { DexieRepository } from '@ember/store';

import { OpfsBlobStore } from './opfs-blob-store.js';
import { subtleCryptoHasher } from './subtle-crypto-hasher.js';
import { createWebClock } from './web-clock.js';
import { createWebStore } from './web-store.js';
import type { WebStore } from './web-store.js';

// ── Context ───────────────────────────────────────────────────────────────────

const StoreContext = createContext<WebStore | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

interface StoreProviderProps {
  children: React.ReactNode;
  /** Injected store for tests; production omits this prop. */
  store?: WebStore;
}

export function StoreProvider({ children, store }: StoreProviderProps) {
  // When an injected store is provided (e.g. in tests), skip production
  // instantiation entirely so jsdom never touches OPFS/IndexedDB.
  const productionStore = useMemo(
    () =>
      store !== undefined
        ? null
        : createWebStore({
            repo: new DexieRepository('ember'),
            blobs: new OpfsBlobStore(),
            hasher: subtleCryptoHasher,
            clock: createWebClock(),
          }),
    // store identity is stable at mount — intentionally excluded from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const value = store ?? (productionStore as WebStore);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWebStore(): WebStore {
  const ctx = useContext(StoreContext);
  if (ctx === null) {
    throw new Error('useWebStore must be used within a StoreProvider');
  }
  return ctx;
}
