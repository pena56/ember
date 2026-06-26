import React, { createContext, useContext, useEffect, useState } from 'react';

import type { Hlc, SyncStore } from '@ember/core';
import { SqliteRepository } from '@ember/store';

import { createSyncSignal } from '../sync/mutation-signal.js';
import type { SyncSignal } from '../sync/mutation-signal.js';
import { withMutationNotify } from '../sync/with-mutation-notify.js';

import { expoCryptoHasher } from './expo-crypto-hasher.js';
import { ExpoFileSystemBlobStore } from './expo-file-system-blob-store.js';
import { expoSqliteDriver } from './expo-sqlite-driver.js';
import { createNativeClock } from './native-clock.js';
import type { NativeStore } from './native-store.js';
import { createNativeStore } from './native-store.js';

// ── Sync bundle ─────────────────────────────────────────────────────────────
// The shared ports the reconciler needs, built from the SAME repo + clock the
// NativeStore uses (single HLC source + single outbox). Null when a store is
// injected (tests / non-production) and in the initial state, so the reconciler
// tears down / never mounts in headless runs.

export interface SyncBundle {
  /** Structural SyncStore — the same repo instance the NativeStore appends to. */
  store: SyncStore;
  /** ReconcilerClock adapter over the shared NativeClock. */
  clock: { tick(): Hlc; receive(remote: Hlc): Hlc };
  /** Fresh outbox id (shared id source). */
  newOutboxId(): string;
  /** Wake signal fired on every local outbox append. */
  signal: SyncSignal;
}

// ── Context ───────────────────────────────────────────────────────────────────

interface StoreState {
  store: NativeStore | null;
  /** true once the SQLite DB is open and the store is ready to use. */
  ready: boolean;
  /** Shared sync ports; null until the production store is built (and in tests). */
  bundle: SyncBundle | null;
}

const StoreContext = createContext<StoreState>({ store: null, ready: false, bundle: null });

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
    // If a store is injected synchronously, mark it ready immediately. The sync
    // bundle stays null so the reconciler tears down — native modules are never
    // touched in headless runs (existing injection escape hatch).
    if (injectedStore !== undefined) {
      return { store: injectedStore, ready: true, bundle: null };
    }
    return { store: null, ready: false, bundle: null };
  });

  useEffect(() => {
    // When an injected store is provided, skip production instantiation entirely.
    if (injectedStore !== undefined) return;

    let cancelled = false;

    async function init() {
      try {
        const driver = await expoSqliteDriver();
        const rawRepo = await SqliteRepository.create(driver);
        const blobs = new ExpoFileSystemBlobStore();
        const clock = createNativeClock();

        // Wrap the repo so every outbox append wakes the reconciler, and share
        // the SAME repo + clock with the NativeStore (single HLC + outbox).
        const signal = createSyncSignal();
        const repo = withMutationNotify(rawRepo, signal.notify);
        const store = createNativeStore({ repo, blobs, hasher: expoCryptoHasher, clock });

        const bundle: SyncBundle = {
          store: repo,
          clock: {
            tick: () => clock.nextStamp(),
            receive: (remote: Hlc) => clock.receive(remote),
          },
          newOutboxId: () => clock.newOutboxId(),
          signal,
        };

        if (!cancelled) {
          setState({ store, ready: true, bundle });
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
  const { store, ready } = useContext(StoreContext);
  return { store, ready };
}

/** The shared sync ports, or null when no production store was instantiated. */
export function useSyncBundle(): SyncBundle | null {
  return useContext(StoreContext).bundle;
}
