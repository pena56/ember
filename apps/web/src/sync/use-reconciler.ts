/**
 * use-reconciler.ts — the web sync scheduler.
 *
 * A pure side-effect hook (mirrors useAnonymousAuth) that decides *when* to run
 * the 12b `reconcile()` driver. It wires the shared sync bundle (repo + clock +
 * outbox id) from the StoreProvider to a Convex-backed transport and runs an
 * overlap-guarded, trailing-coalescing sync loop on a sensible schedule.
 *
 * Invariants:
 *  - #1 Convex stays off the read path: reconcile only ever runs here, in the
 *    background; the UI keeps reading the local store. Offline runs are skipped,
 *    never awaited by render.
 *  - #5 Zero merge logic here — all decisions come from core's applyPull via
 *    reconcile(). This hook only supplies ports + scheduler.
 *
 * Gating: runs only when authenticated AND a sync bundle exists (production
 * store instantiated). Sign-out / bundle-null tears the scheduler down.
 */

import { useConvexAuth } from 'convex/react';
import { useEffect, useRef } from 'react';

import { reconcile } from '@ember/core';
import type { SyncTransport } from '@ember/core';

import { useSyncBundle } from '../store/store-context.js';

import { createConvexSyncTransport } from './convex-sync-transport.js';

const DEFAULT_INTERVAL_MS = 15_000;
const DEBOUNCE_MS = 500;

export function useReconciler(opts?: { transport?: SyncTransport; intervalMs?: number }): void {
  const { isAuthenticated } = useConvexAuth();
  const bundle = useSyncBundle();

  // Overlap guard + trailing-coalesce flag live across renders.
  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);

  const injectedTransport = opts?.transport;
  const intervalMs = opts?.intervalMs ?? DEFAULT_INTERVAL_MS;

  useEffect(() => {
    // Gate: do nothing (and tear down) unless authenticated with a real bundle.
    if (!isAuthenticated || bundle === null) return;
    const activeBundle = bundle;

    let disposed = false;

    // Resolve the transport behind the injection. When none is injected we
    // lazily import the convex singleton (which throws at module-eval without
    // VITE_CONVEX_URL) so tests that inject a transport never load it.
    let transportPromise: Promise<SyncTransport> | undefined;
    const getTransport = (): Promise<SyncTransport> => {
      if (injectedTransport) return Promise.resolve(injectedTransport);
      transportPromise ??= import('../convex/convex-client.js').then((m) =>
        createConvexSyncTransport(m.convex),
      );
      return transportPromise;
    };

    async function run(): Promise<void> {
      if (inFlightRef.current) {
        // A reconcile is already running — request a single trailing pass.
        queuedRef.current = true;
        return;
      }
      // Fail soft offline; the 'online' listener re-triggers.
      if (!navigator.onLine) return;

      inFlightRef.current = true;
      try {
        const transport = await getTransport();
        do {
          queuedRef.current = false;
          await reconcile({
            store: activeBundle.store,
            transport,
            clock: activeBundle.clock,
            newOutboxId: activeBundle.newOutboxId,
          });
        } while (queuedRef.current && !disposed);
      } catch {
        // Swallow — local-first: a sync failure is non-fatal; next trigger retries.
      } finally {
        inFlightRef.current = false;
      }
    }

    const trigger = (): void => {
      void run();
    };

    // Debounced trigger for the rapid local-mutation signal.
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    const debouncedTrigger = (): void => {
      if (debounceTimer !== undefined) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = undefined;
        void run();
      }, DEBOUNCE_MS);
    };

    // Immediate run on mount (auth-ready false→true).
    void run();

    // Periodic.
    const interval = setInterval(trigger, intervalMs);

    // Lifecycle.
    window.addEventListener('focus', trigger);
    window.addEventListener('online', trigger);

    // Fast push after each local mutation.
    const unsubscribe = activeBundle.signal.subscribe(debouncedTrigger);

    return () => {
      disposed = true;
      clearInterval(interval);
      window.removeEventListener('focus', trigger);
      window.removeEventListener('online', trigger);
      unsubscribe();
      if (debounceTimer !== undefined) clearTimeout(debounceTimer);
    };
  }, [isAuthenticated, bundle, injectedTransport, intervalMs]);
}
