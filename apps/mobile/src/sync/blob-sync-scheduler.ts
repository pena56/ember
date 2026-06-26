/**
 * blob-sync-scheduler.ts — pure, injectable blob-sync scheduler (no platform imports).
 *
 * Decides *when* to run the 13b `reconcileBlobs` driver, injected as a dep. The
 * run loop is overlap-guarded and trailing-coalescing, mirroring sync-scheduler.ts
 * but for blob-sync. All platform ports injected structurally so this module stays
 * platform-free and node-testable. The thin `use-blob-sync.ts` adapter wires
 * production RN `AppState` + `expo-network` + the convex singleton into it.
 *
 * Key differences from sync-scheduler.ts:
 *  - runOnce does ONE blob-sync pass: listDocuments() → over-cap pre-skip → reconcileBlobs().
 *  - over-cap pre-skip (refinement #1): when fileCap is known, pre-mark docs with
 *    byteSize > fileCap as {status:'deferred',code:'over-file-cap'} and exclude from
 *    candidateIds, even on retryDeferred (an over-cap file can never shrink).
 *  - blobChange.notify() fired in finally after EVERY pass (refinement #2), so the
 *    library re-reads badges without a remount — even on a swallowed failure.
 *  - Exposes run(retryDeferred=false) publicly for the retryDeferred() path.
 *
 * Invariants:
 *  - #2 blob-status records written via blobStatus.put/delete (no notify, no enqueue).
 *    blobChange is a SEPARATE local UI signal, never the reconciler wake signal.
 *  - NO platform imports — pure node-testable module.
 */

import type { BlobBytes, BlobStatus, BlobStatusStore, BlobTransport, CryptoBox } from '@ember/core';
import { BLOB_SYNC_COLLECTION, reconcileBlobs as coreReconcileBlobs } from '@ember/core';

import type { SyncSignal } from './mutation-signal.js';
import type { AppStateLike, NetworkLike } from './sync-scheduler.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BlobSyncSchedulerDeps {
  /** Returns the current document list (id + byteSize needed for pre-skip). */
  listDocuments: () => Promise<{ id: string; byteSize: number }[]>;
  /**
   * reconcileBlobs implementation. Injected so tests can spy on it.
   * Defaults to @ember/core's reconcileBlobs in production.
   */
  reconcileBlobs: typeof coreReconcileBlobs;
  /** Local blob store (BlobBytes port). */
  blobs: BlobBytes;
  /** BlobTransport (upload/download/saveBlob/deleteBlob). */
  transport: BlobTransport;
  /** AES-256-GCM CryptoBox. */
  crypto: CryptoBox;
  /** Local status store (BlobStatusStore port). */
  blobStatus: BlobStatusStore;
  /**
   * Local UI-refresh signal fired after each pass (invariant #2).
   * Distinct from `signal` (the reconciler wake) — blob-status writes never
   * enqueue/notify the outbox, so the library has no other way to learn a badge changed.
   */
  blobChange: Pick<SyncSignal, 'notify'>;
  /** prod: expo-network getNetworkStateAsync().isConnected. */
  isOnline: () => Promise<boolean>;
  /** Mutation wake (for debounced trigger). */
  signal: SyncSignal;
  /** prod: react-native AppState. */
  appState: AppStateLike;
  /** prod: expo-network. */
  network: NetworkLike;
  /**
   * Server per-file cap (bytes), from getStorageUsage. When known, blobs whose
   * local byteSize already exceeds it are pre-marked deferred/over-file-cap and
   * excluded from candidateIds — even on a retryDeferred pass (an over-cap file
   * can never shrink). The server remains authoritative for files near the boundary.
   */
  fileCap?: number | undefined;
  /** Periodic run cadence (default 15s). */
  intervalMs?: number;
  /** Debounce window for the mutation signal (default 500ms). */
  debounceMs?: number;
}

const DEFAULT_INTERVAL_MS = 15_000;
const DEFAULT_DEBOUNCE_MS = 500;

// ── Factory ───────────────────────────────────────────────────────────────────

export interface BlobSyncScheduler {
  /** Public so use-blob-sync can expose retryDeferred(). */
  run(retryDeferred?: boolean): Promise<void>;
  dispose(): void;
}

export function createBlobSyncScheduler(deps: BlobSyncSchedulerDeps): BlobSyncScheduler {
  const {
    listDocuments,
    reconcileBlobs,
    blobs,
    transport,
    crypto,
    blobStatus,
    blobChange,
    isOnline,
    signal,
    appState,
    network,
    fileCap,
  } = deps;
  const intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;
  const debounceMs = deps.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  let inFlight = false;
  let queued = false;
  let disposed = false;

  async function run(retryDeferred = false): Promise<void> {
    if (inFlight) {
      // A pass is already running — request a single trailing pass.
      queued = true;
      return;
    }
    inFlight = true;
    try {
      do {
        queued = false;
        // Fail soft offline; the network listener re-triggers when connectivity returns.
        // The check is inside the loop, after taking the in-flight lock.
        if (!(await isOnline())) break;

        const docs = await listDocuments();

        // Over-cap pre-skip (refinement #1): when fileCap is known, pre-mark each doc
        // whose byteSize > fileCap as deferred/over-file-cap and exclude from candidateIds.
        // Applied even on a retryDeferred pass — an over-cap file can never shrink, so
        // retrying is pointless. The server remains authoritative for files near the boundary.
        let candidates = docs;
        if (fileCap !== undefined) {
          const overCap = docs.filter((d) => d.byteSize > fileCap);
          for (const d of overCap) {
            await blobStatus.put<BlobStatus>(BLOB_SYNC_COLLECTION, {
              id: d.id,
              status: 'deferred',
              code: 'over-file-cap',
            });
          }
          candidates = docs.filter((d) => d.byteSize <= fileCap);
        }

        const candidateIds = candidates.map((d) => d.id);

        await reconcileBlobs({
          candidateIds,
          blobs,
          transport,
          crypto,
          status: blobStatus,
          retryDeferred,
        });
      } while (queued && !disposed);
    } catch {
      // Swallow — local-first: a sync failure is non-fatal; next trigger retries.
    } finally {
      inFlight = false;
      // Wake the library UI: status records (synced / deferred / over-cap) are written
      // via put/delete with no outbox enqueue (invariant #2), so this local signal is
      // the only thing that tells the row to re-read its badge. Fired even on a swallowed
      // failure — pre-skip writes still land.
      blobChange.notify();
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
    }, debounceMs);
  };

  // Immediate run on construct (auth-ready).
  void run();

  // Periodic.
  const interval = setInterval(trigger, intervalMs);

  // Lifecycle: run on foreground.
  const appSub = appState.addEventListener('change', (state) => {
    if (state === 'active') void run();
  });

  // Connectivity: run when the network reconnects.
  const netSub = network.addNetworkStateListener((state) => {
    if (state.isConnected) void run();
  });

  // Fast push after each local mutation.
  const unsubscribe = signal.subscribe(debouncedTrigger);

  return {
    run,
    dispose(): void {
      disposed = true;
      clearInterval(interval);
      appSub.remove();
      netSub.remove();
      unsubscribe();
      if (debounceTimer !== undefined) clearTimeout(debounceTimer);
    },
  };
}
