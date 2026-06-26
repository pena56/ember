/**
 * use-blob-sync.ts — thin RN adapter that mounts the blob-sync scheduler.
 *
 * Mirrors use-reconciler.ts: a pure side-effect hook that wires the platform
 * ports — RN `AppState`, `expo-network`, and the lazily-imported convex
 * singleton — into the pure `createBlobSyncScheduler`. All the schedulable logic
 * lives in blob-sync-scheduler.ts (node-tested); this file is intentionally
 * untested (thin glue, covered by typecheck), like use-reconciler.ts.
 *
 * Gating: the scheduler is built only when authenticated AND a sync bundle
 * exists (production store instantiated). Sign-out / bundle-null tears it down.
 *
 * Returns { retryDeferred } so the screen can expose a "Try again" affordance.
 *
 * Invariants:
 *  - #1 Bytes only move in/out of the local ExpoFileSystemBlobStore (blobs port).
 *  - #2 blob-status records written via put/delete (no notify, no enqueue) — local-only.
 *    blobChange is a separate local UI signal, never the outbox wake signal.
 */

import { useConvexAuth } from 'convex/react';
import * as Network from 'expo-network';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { reconcileBlobs } from '@ember/core';
import type { CryptoBox } from '@ember/core';

import { useSyncBundle, useNativeStore } from '../store/store-context.js';

import { createBlobSyncScheduler } from './blob-sync-scheduler.js';
import type { BlobSyncScheduler } from './blob-sync-scheduler.js';

export interface UseBlobSyncOpts {
  fileCap?: number;
  intervalMs?: number;
}

export interface UseBlobSyncResult {
  /** One-shot retry that includes previously-deferred blobs. */
  retryDeferred(): Promise<void>;
}

export function useBlobSync(opts?: UseBlobSyncOpts): UseBlobSyncResult {
  const { isAuthenticated } = useConvexAuth();
  const bundle = useSyncBundle();
  const { store } = useNativeStore();

  const fileCap = opts?.fileCap;
  const intervalMs = opts?.intervalMs;

  // Cache CryptoBox per session (one loadBlobKey per mount)
  const cryptoRef = useRef<CryptoBox | null>(null);

  // Stable ref for retryDeferred
  const schedulerRef = useRef<BlobSyncScheduler | null>(null);
  const retryDeferredRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    // Gate: do nothing (and tear down) unless authenticated with a real bundle + store.
    if (!isAuthenticated || bundle === null || store === null) return;
    const activeBundle = bundle;
    const activeStore = store;

    let disposed = false;
    let dispose: (() => void) | undefined;

    void (async () => {
      // Lazily build CryptoBox — one loadBlobKey per session.
      if (cryptoRef.current === null) {
        try {
          const { convex } = await import('../convex/convex-client.js');
          if (convex === null) return; // offline-local mode
          const { loadBlobKey, createNativeCryptoBox } = await import('../store/native-crypto-box.js');
          const keyBytes = await loadBlobKey(convex as Parameters<typeof loadBlobKey>[0]);
          cryptoRef.current = createNativeCryptoBox(keyBytes);
        } catch {
          // Key fetch failed — bail until next auth cycle.
          return;
        }
      }
      if (disposed) return;

      const crypto = cryptoRef.current!;

      const scheduler = createBlobSyncScheduler({
        listDocuments: () => activeStore.listDocuments(),
        reconcileBlobs,
        blobs: activeBundle.blobs,
        transport: await (async () => {
          const { convex } = await import('../convex/convex-client.js');
          if (convex === null) throw new Error('convex null');
          const { createConvexBlobTransport } = await import('./convex-blob-transport.js');
          return createConvexBlobTransport(convex);
        })(),
        crypto,
        blobStatus: activeBundle.blobStatus,
        blobChange: activeBundle.blobChange,
        isOnline: async () => (await Network.getNetworkStateAsync()).isConnected ?? false,
        signal: activeBundle.signal,
        appState: AppState,
        network: Network,
        fileCap,
        ...(intervalMs !== undefined ? { intervalMs } : {}),
      });

      schedulerRef.current = scheduler;
      retryDeferredRef.current = async () => { await scheduler.run(true); };
      dispose = scheduler.dispose;
    })();

    return () => {
      disposed = true;
      cryptoRef.current = null; // reset so re-mount re-fetches key
      schedulerRef.current = null;
      retryDeferredRef.current = async () => {};
      dispose?.();
    };
  }, [isAuthenticated, bundle, store, fileCap, intervalMs]);

  return {
    retryDeferred(): Promise<void> {
      return retryDeferredRef.current();
    },
  };
}
