/**
 * sync-scheduler.ts — the pure, injectable sync scheduler (no platform imports).
 *
 * Decides *when* to run the 12b `reconcile()` driver, injected as `runOnce`. The
 * run loop is overlap-guarded and trailing-coalescing (the mobile analog of
 * 12c's web `run()`), but with an async offline check (`expo-network`) and the
 * RN lifecycle ports injected structurally so this module stays platform-free
 * and node-testable. The thin `use-reconciler.ts` adapter wires production RN
 * `AppState` + `expo-network` + the convex singleton into it.
 *
 * Invariants:
 *  - #1 Convex stays off the read path: `runOnce` (reconcile) only ever runs in
 *    this background loop; offline runs are skipped, never awaited by render.
 *  - #5 Zero merge logic here — all decisions come from core's applyPull via the
 *    injected `runOnce`. This module only supplies the schedule.
 */

import type { SyncSignal } from './mutation-signal.js';

// ── Ports ──────────────────────────────────────────────────────────────────────

/** Structural RN AppState (subscribe to foreground/background transitions). */
export interface AppStateLike {
  addEventListener(type: 'change', handler: (state: string) => void): { remove(): void };
}

/** Structural expo-network listener (subscribe to connectivity changes). */
export interface NetworkLike {
  addNetworkStateListener(listener: (state: { isConnected?: boolean }) => void): { remove(): void };
}

export interface SyncSchedulerDeps {
  /** Does ONE reconcile(...) — injected (merge-agnostic). */
  runOnce: () => Promise<unknown>;
  /** prod: expo-network getNetworkStateAsync().isConnected. */
  isOnline: () => Promise<boolean>;
  /** Mutation wake. */
  signal: SyncSignal;
  /** prod: react-native AppState. */
  appState: AppStateLike;
  /** prod: expo-network. */
  network: NetworkLike;
  /** Periodic run cadence (default 15s). */
  intervalMs?: number;
  /** Debounce window for the mutation signal (default 500ms). */
  debounceMs?: number;
}

// ── Defaults ────────────────────────────────────────────────────────────────────

const DEFAULT_INTERVAL_MS = 15_000;
const DEFAULT_DEBOUNCE_MS = 500;

// ── Factory ───────────────────────────────────────────────────────────────────

export function createSyncScheduler(deps: SyncSchedulerDeps): { dispose(): void } {
  const { runOnce, isOnline, signal, appState, network } = deps;
  const intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;
  const debounceMs = deps.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  let inFlight = false;
  let queued = false;
  let disposed = false;

  async function run(): Promise<void> {
    if (inFlight) {
      // A reconcile is already running — request a single trailing pass.
      queued = true;
      return;
    }
    inFlight = true;
    try {
      do {
        queued = false;
        // Fail soft offline; the network listener re-triggers when connectivity
        // returns. The check is inside the loop, after taking the in-flight lock.
        if (!(await isOnline())) break;
        await runOnce();
      } while (queued && !disposed);
    } catch {
      // Swallow — local-first: a sync failure is non-fatal; next trigger retries.
    } finally {
      inFlight = false;
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
