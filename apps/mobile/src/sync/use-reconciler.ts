/**
 * use-reconciler.ts — the thin RN adapter that mounts the sync scheduler.
 *
 * A pure side-effect hook (mirrors useAnonymousAuth) that wires the platform
 * ports — RN `AppState`, `expo-network`, and the lazily-imported convex
 * singleton — into the pure `createSyncScheduler`. All the schedulable logic
 * lives in sync-scheduler.ts (node-tested); this file is intentionally untested
 * (thin glue, covered by typecheck), like useAnonymousAuth.
 *
 * Gating: the scheduler is built only when authenticated AND a sync bundle
 * exists (production store instantiated). Sign-out / bundle-null tears it down.
 * The convex singleton is lazily imported so node tests and headless graphs
 * never touch native auth modules.
 *
 * Invariants:
 *  - #1 Convex stays off the read path: reconcile only runs in the background
 *    scheduler; the UI keeps reading the local store.
 *  - #5 Zero merge logic here — all decisions come from core's applyPull via
 *    reconcile(). This hook only supplies ports + scheduler.
 */

import { useConvexAuth } from 'convex/react';
import * as Network from 'expo-network';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { reconcile } from '@ember/core';
import type { SyncTransport } from '@ember/core';

import { useSyncBundle } from '../store/store-context.js';

import { createConvexSyncTransport } from './convex-sync-transport.js';
import { createSyncScheduler } from './sync-scheduler.js';

export function useReconciler(opts?: { transport?: SyncTransport; intervalMs?: number }): void {
  const { isAuthenticated } = useConvexAuth();
  const bundle = useSyncBundle();

  const injectedTransport = opts?.transport;
  const intervalMs = opts?.intervalMs;

  useEffect(() => {
    // Gate: do nothing (and tear down) unless authenticated with a real bundle.
    if (!isAuthenticated || bundle === null) return;
    const activeBundle = bundle;

    let disposed = false;
    let dispose: (() => void) | undefined;

    void (async () => {
      // Resolve the transport behind the optional injection. When none is
      // injected we lazily import the convex singleton (null without
      // EXPO_PUBLIC_CONVEX_URL) so node tests never load native modules.
      let transport = injectedTransport;
      if (transport === undefined) {
        const { convex } = await import('../convex/convex-client.js');
        if (convex === null) return; // gate already prevents this in practice
        transport = createConvexSyncTransport(convex);
      }
      if (disposed) return;

      const scheduler = createSyncScheduler({
        runOnce: () =>
          reconcile({
            store: activeBundle.store,
            transport,
            clock: activeBundle.clock,
            newOutboxId: activeBundle.newOutboxId,
          }),
        isOnline: async () => (await Network.getNetworkStateAsync()).isConnected ?? false,
        signal: activeBundle.signal,
        appState: AppState,
        network: Network,
        ...(intervalMs !== undefined ? { intervalMs } : {}),
      });
      dispose = scheduler.dispose;
    })();

    return () => {
      disposed = true;
      dispose?.();
    };
  }, [isAuthenticated, bundle, injectedTransport, intervalMs]);
}
