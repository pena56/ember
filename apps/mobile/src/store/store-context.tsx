import React, { createContext, useContext, useEffect, useState } from 'react';

import { SqliteRepository } from '@ember/store';

import { expoCryptoHasher } from './expo-crypto-hasher.js';
import { ExpoFileSystemBlobStore } from './expo-file-system-blob-store.js';
import { expoSqliteDriver } from './expo-sqlite-driver.js';
import { createNativeClock } from './native-clock.js';
import type { NativeStore } from './native-store.js';
import { createNativeStore } from './native-store.js';

// ── Context ───────────────────────────────────────────────────────────────────

interface StoreState {
  store: NativeStore | null;
  /** true once the SQLite DB is open and the store is ready to use. */
  ready: boolean;
}

const StoreContext = createContext<StoreState>({ store: null, ready: false });

// ── Provider ──────────────────────────────────────────────────────────────────

interface StoreProviderProps {
  children: React.ReactNode;
  /**
   * Injected store for tests or Storybook; production omits this prop.
   * When provided, skips native construction so native modules are never touched
   * in headless environments (mirrors web's injection escape hatch + 04b jsdom guard).
   */
  store?: NativeStore;
}

export function StoreProvider({ children, store: injectedStore }: StoreProviderProps) {
  const [state, setState] = useState<StoreState>(() => {
    // If a store is injected synchronously, mark it ready immediately.
    if (injectedStore !== undefined) {
      return { store: injectedStore, ready: true };
    }
    return { store: null, ready: false };
  });

  useEffect(() => {
    // When an injected store is provided, skip production instantiation entirely.
    if (injectedStore !== undefined) return;

    let cancelled = false;

    async function init() {
      try {
        const driver = await expoSqliteDriver();
        const repo = await SqliteRepository.create(driver);
        const blobs = new ExpoFileSystemBlobStore();
        const clock = createNativeClock();
        const store = createNativeStore({ repo, blobs, hasher: expoCryptoHasher, clock });

        if (!cancelled) {
          setState({ store, ready: true });
        }
      } catch (err) {
        // Surface init errors in dev; in production a retry/splash strategy
        // would live here. For now just log.
        if (!cancelled) {
          console.error('[StoreProvider] init failed:', err);
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
    // injectedStore is stable at mount — intentionally excluded from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <StoreContext.Provider value={state}>{children}</StoreContext.Provider>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseNativeStoreResult {
  store: NativeStore | null;
  ready: boolean;
}

export function useNativeStore(): UseNativeStoreResult {
  return useContext(StoreContext);
}
