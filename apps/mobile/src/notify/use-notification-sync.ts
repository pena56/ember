/**
 * use-notification-sync.ts — thin RN adapter for the notification-sync scheduler.
 *
 * Mirrors use-reconciler.ts exactly for gating / teardown / lazy-singleton pattern.
 * Reuses createSyncScheduler for the schedule (immediate + 15s interval + foreground
 * + reconnect + debounced mutation signal, overlap-guarded).
 *
 * Untested thin glue (like use-reconciler.ts) — covered by typecheck only.
 *
 * Invariants:
 *  - #1 All reads stay local (NativeStore); the hook only writes intents/claims,
 *    fail-soft, never on the render path.
 *  - #2 Notification intents/claims are direct authed calls — NOT outbox.
 *  - #5 Zero decision logic here — all planning defers to deriveNotificationSync
 *    via runNotificationSync.
 *  - #7 Submit one + suppress; server ledger elects / dedupes. Mobile never
 *    elects or fires locally.
 *
 * Gating: runs only when useConvexAuth().isAuthenticated AND useSyncBundle() !== null.
 * Sign-out / bundle-null tears the hook down (same as useReconciler).
 */

import { useConvexAuth } from 'convex/react';
import * as Network from 'expo-network';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { useNativeStore, useSyncBundle } from '../store/store-context.js';
import { createSyncScheduler } from '../sync/sync-scheduler.js';

import type { NotificationPort } from './notification-port.js';
import { runNotificationSync } from './run-notification-sync.js';

export function useNotificationSync(opts?: {
  port?: NotificationPort;
  intervalMs?: number;
}): void {
  const { isAuthenticated } = useConvexAuth();
  const bundle = useSyncBundle();

  // The NativeStore identity is stable from mount (see StoreProvider), so it is
  // read inside the effect via a ref and intentionally NOT a dependency —
  // mirrors useReconciler reading activeBundle.store without re-subscribing.
  const { store } = useNativeStore();
  const storeRef = useRef(store);
  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  const injectedPort = opts?.port;
  const intervalMs = opts?.intervalMs;

  useEffect(() => {
    // Gate: do nothing (and tear down) unless authenticated with a real bundle.
    if (!isAuthenticated || bundle === null) return;
    const activeBundle = bundle;

    let disposed = false;
    let dispose: (() => void) | undefined;

    // Lazily-resolved port singleton (guards against concurrent import races).
    let portPromise: Promise<NotificationPort> | undefined;
    const getPort = (): Promise<NotificationPort> => {
      if (injectedPort) return Promise.resolve(injectedPort);
      portPromise ??= Promise.all([
        import('../convex/convex-client.js'),
        import('./convex-notification-port.js'),
      ]).then(([{ convex }, { createConvexNotificationPort }]) => {
        if (convex === null) {
          // Guard: should not reach in practice (gate prevents it), but mirrors
          // use-reconciler's null-convex guard for robustness.
          return Promise.reject(new Error('[useNotificationSync] convex client is null'));
        }
        return createConvexNotificationPort(convex);
      });
      return portPromise;
    };

    void (async () => {
      // Resolve the port before building the scheduler — same async-init pattern
      // as use-reconciler so the lazy import never happens inside runOnce.
      let port: NotificationPort;
      try {
        port = await getPort();
      } catch {
        // Missing convex client — offline-local mode; do not mount scheduler.
        return;
      }
      if (disposed) return;

      const scheduler = createSyncScheduler({
        runOnce: () => {
          // store and bundle are set in the same atomic setState, so whenever the
          // gate (bundle !== null) holds, store is non-null. Guard honestly rather
          // than synthesizing an empty store (which would re-hardcode core's
          // DEFAULT_GOAL_ACTIVE_MS and silently mis-derive).
          const store = storeRef.current;
          if (store === null) return Promise.resolve();
          return runNotificationSync({
            port,
            store,
            deviceId: activeBundle.deviceId,
            platform: Platform.OS as 'ios' | 'android',
            now: Date.now(),
            tzOffsetMinutes: -new Date().getTimezoneOffset(),
          });
        },
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
  }, [isAuthenticated, bundle, injectedPort, intervalMs]);
}
