/**
 * use-blob-sync.ts — the web blob-sync scheduler.
 *
 * Mirrors use-reconciler: overlap-guarded, trailing-coalescing loop that
 * decides *when* to run the 13b reconcileBlobs driver. Decoupled from the
 * record-sync reconciler (separate concerns, separate hooks).
 *
 * Invariants:
 *  - #1 Bytes only move in/out of the local OpfsBlobStore (blobs port).
 *  - #2 Never enqueues an outbox entry. blob-sync status records written via
 *    repo.put/delete (no notify, no enqueue) — local-only, never pushed.
 *
 * Gating: auth + bundle (same as useReconciler). Injectable opts so tests
 * inject fakes and never load the convex singleton.
 */

import { useConvexAuth } from 'convex/react';
import { useEffect, useRef } from 'react';

import { reconcileBlobs } from '@ember/core';
import type { BlobTransport, CryptoBox, BlobSyncReport } from '@ember/core';

import { useSyncBundle, useWebStore } from '../store/store-context.js';

const DEFAULT_INTERVAL_MS = 15_000;
const DEBOUNCE_MS = 500;

export interface UseBlobSyncOpts {
  /** Inject a fake transport (tests only — skips convex lazy import). */
  transport?: BlobTransport;
  /** Inject a fake CryptoBox (tests only — skips loadBlobKey). */
  crypto?: CryptoBox;
  intervalMs?: number;
}

export interface UseBlobSyncResult {
  /** One-shot retry that includes previously-deferred blobs. */
  retryDeferred(): Promise<void>;
}

export function useBlobSync(opts?: UseBlobSyncOpts): UseBlobSyncResult {
  const { isAuthenticated } = useConvexAuth();
  const bundle = useSyncBundle();
  const webStore = useWebStore();

  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);

  // Cache CryptoBox per session (one loadBlobKey per mount)
  const cryptoRef = useRef<CryptoBox | null>(null);
  // Cache transport once resolved
  const transportRef = useRef<BlobTransport | null>(null);

  const injectedTransport = opts?.transport;
  const injectedCrypto = opts?.crypto;
  const intervalMs = opts?.intervalMs ?? DEFAULT_INTERVAL_MS;

  // Stable ref for retryDeferred so render never captures stale closure
  const retryDeferredRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    if (!isAuthenticated || bundle === null) return;
    const activeBundle = bundle;

    let disposed = false;

    // Lazily build transport — lazy-import convex singleton to keep it off the
    // test graph (it throws at import time without VITE_CONVEX_URL).
    const getTransport = async (): Promise<BlobTransport> => {
      if (injectedTransport) return injectedTransport;
      if (transportRef.current) return transportRef.current;
      const [{ convex }, { createConvexBlobTransport }] = await Promise.all([
        import('../convex/convex-client.js'),
        import('./convex-blob-transport.js'),
      ]);
      transportRef.current = createConvexBlobTransport(convex);
      return transportRef.current;
    };

    // Lazily build CryptoBox — one loadBlobKey per session.
    const getCrypto = async (): Promise<CryptoBox> => {
      if (injectedCrypto) return injectedCrypto;
      if (cryptoRef.current) return cryptoRef.current;
      const [{ convex }, { loadBlobKey, createWebCryptoBox }] = await Promise.all([
        import('../convex/convex-client.js'),
        import('../store/web-crypto-box.js'),
      ]);
      const key = await loadBlobKey(convex as Parameters<typeof loadBlobKey>[0]);
      cryptoRef.current = await createWebCryptoBox(key);
      return cryptoRef.current;
    };

    async function run(retryDeferred = false): Promise<BlobSyncReport | undefined> {
      if (inFlightRef.current) {
        queuedRef.current = true;
        return;
      }
      if (!navigator.onLine) return;

      inFlightRef.current = true;
      try {
        const [transport, crypto] = await Promise.all([getTransport(), getCrypto()]);
        let report: BlobSyncReport | undefined;
        do {
          queuedRef.current = false;
          const docs = await webStore.listDocuments();
          const candidateIds = docs.map((d) => d.id);
          report = await reconcileBlobs({
            candidateIds,
            blobs: activeBundle.blobs,
            transport,
            crypto,
            status: activeBundle.blobStatus,
            retryDeferred,
          });
        } while (queuedRef.current && !disposed);
        return report;
      } catch {
        // Swallow — local-first; a sync failure is non-fatal.
      } finally {
        inFlightRef.current = false;
      }
      return undefined;
    }

    const trigger = (): void => { void run(); };

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    const debouncedTrigger = (): void => {
      if (debounceTimer !== undefined) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = undefined;
        void run();
      }, DEBOUNCE_MS);
    };

    // Wire retryDeferred into the stable ref so the returned callback always calls run(true)
    retryDeferredRef.current = async () => { await run(true); };

    // Immediate run on mount
    void run();

    const interval = setInterval(trigger, intervalMs);
    window.addEventListener('focus', trigger);
    window.addEventListener('online', trigger);
    const unsubscribe = activeBundle.signal.subscribe(debouncedTrigger);

    return () => {
      disposed = true;
      clearInterval(interval);
      window.removeEventListener('focus', trigger);
      window.removeEventListener('online', trigger);
      unsubscribe();
      if (debounceTimer !== undefined) clearTimeout(debounceTimer);
    };
  }, [isAuthenticated, bundle, webStore, injectedTransport, injectedCrypto, intervalMs]);

  return {
    retryDeferred(): Promise<void> {
      return retryDeferredRef.current();
    },
  };
}
