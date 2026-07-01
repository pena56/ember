/**
 * use-notification-sync.ts — background notification-sync scheduler.
 *
 * Mirrors use-reconciler.ts exactly for gating / teardown / lazy-singleton /
 * error-swallowing (auth+bundle-gated side-effect-hook pattern).
 *
 * Invariants:
 *  - #1 All reads are local; the hook only *writes* notification intents/claims,
 *    fail-soft, never on the render path. Convex stays off the read path.
 *  - #2 Notification intents/claims are direct authed calls by design — same
 *    exception class as 13a blob metadata; nothing here goes through the outbox.
 *  - #5 Zero decision logic reinvented — all planning defers to 16a's engine
 *    via deriveNotificationSync.
 *  - #7 Web submits the single selected + suppresses; the 16b server ledger
 *    dedupes. Web never elects or fires locally.
 *
 * Gating: runs only when useConvexAuth().isAuthenticated AND useSyncBundle() !== null.
 * Sign-out / bundle-null tears the hook down (same as useReconciler).
 */

import { useConvexAuth } from 'convex/react';
import { useEffect, useRef } from 'react';

import { deriveNotificationSync, resolveNotificationConfig } from '@ember/core';

import { useSyncBundle } from '../store/store-context.js';
import { useWebStore } from '../store/store-context.js';

const DEBOUNCE_MS = 500;

// ── Port ──────────────────────────────────────────────────────────────────────

/**
 * A single registered device as returned by getNotificationState.
 * Matches the shape 17g's Convex query returns (no raw push tokens).
 */
export interface NotificationStateDevice {
  deviceId: string;
  platform: 'ios' | 'android' | 'web';
  hasToken: boolean;
  lastSeenAt: number;
  isPrimary: boolean;
}

export interface NotificationPort {
  registerDevice(args: { deviceId: string; platform: 'web' }): Promise<unknown>;
  submitIntent(args: {
    deviceId: string;
    dedupeKey: string;
    type: string;
    localDay: string;
    scheduledWall: number;
    title: string;
    body: string;
  }): Promise<unknown>;
  claimSlot(args: { dedupeKey: string; deviceId: string; via: 'suppressed' }): Promise<unknown>;
  getNotificationState(): Promise<{ devices: NotificationStateDevice[] }>;
  /** Designates the owner's primary push device; server enforces exactly-one-per-owner. */
  setPrimaryDevice(args: { deviceId: string }): Promise<unknown>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useNotificationSync(opts?: { port?: NotificationPort }): void {
  const { isAuthenticated } = useConvexAuth();
  const bundle = useSyncBundle();

  // The WebStore identity is stable from mount (see StoreProvider), so it is
  // read inside the effect via a ref and intentionally NOT a dependency —
  // mirrors useReconciler reading activeBundle.store without re-subscribing.
  const store = useWebStore();
  const storeRef = useRef(store);
  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  // Overlap guard across renders.
  const inFlightRef = useRef(false);

  const injectedPort = opts?.port;

  useEffect(() => {
    // Gate: do nothing (and tear down) unless authenticated with a real bundle.
    if (!isAuthenticated || bundle === null) return;
    const activeBundle = bundle;
    const deviceId = activeBundle.deviceId;

    let disposed = false;

    // Resolve the port. When injected, use it; else lazily import the convex
    // singleton + the notification port adapter — same lazy pattern useReconciler
    // uses for its transport, so injected-port tests never load the singleton.
    let portPromise: Promise<NotificationPort> | undefined;
    const getPort = (): Promise<NotificationPort> => {
      if (injectedPort) return Promise.resolve(injectedPort);
      portPromise ??= Promise.all([
        import('../convex/convex-client.js'),
        import('./convex-notification-port.js'),
      ]).then(([{ convex }, { createConvexNotificationPort }]) =>
        createConvexNotificationPort(convex),
      );
      return portPromise;
    };

    async function run(): Promise<void> {
      if (inFlightRef.current) return;
      if (!navigator.onLine) return;

      inFlightRef.current = true;
      try {
        const port = await getPort();
        if (disposed) return;

        // Step 1: Register device + liveness heartbeat.
        await port.registerDevice({ deviceId, platform: 'web' });
        if (disposed) return;

        // Step 2: Read sessions, goal config, and notification prefs (all local — invariant #1;
        //         getNotificationPreferences is a local read, no Convex on the read path).
        const store = storeRef.current;
        const sessions = await store.listSessions();
        const goalConfig = await store.getGoalConfig();
        if (disposed) return;
        const prefsRecord = await store.getNotificationPreferences();
        if (disposed) return;

        // Step 3: Derive the sync plan from 16a's engine (pure, no I/O).
        const now = Date.now();
        const tzOffsetMinutes = -new Date().getTimezoneOffset();
        const { intent, suppress } = deriveNotificationSync({
          sessions,
          now,
          tzOffsetMinutes,
          config: {
            goalTargetMs: goalConfig.targetActiveMs,
            ...resolveNotificationConfig(prefsRecord.prefs),
          },
        });
        if (disposed) return;

        // Step 4: Submit the intent if any.
        if (intent) {
          await port.submitIntent({
            deviceId,
            dedupeKey: intent.plan.dedupeKey,
            type: intent.plan.type,
            localDay: intent.plan.localDay,
            scheduledWall: intent.plan.scheduledWall,
            title: intent.title,
            body: intent.body,
          });
          if (disposed) return;
        }

        // Step 5: Claim suppressed slots (goal met — block all devices from nudging).
        for (const key of suppress) {
          if (disposed) return;
          await port.claimSlot({ dedupeKey: key, deviceId, via: 'suppressed' });
        }
      } catch {
        // Swallow — local-first: a write failure is non-fatal; next trigger retries.
        // (invariant #1: hook never blocks render on a network failure)
      } finally {
        inFlightRef.current = false;
      }
    }

    const trigger = (): void => {
      void run();
    };

    // Debounced trigger for rapid local-mutation signals.
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

    // Lifecycle listeners.
    window.addEventListener('focus', trigger);

    // Fast push after each local session capture.
    const unsubscribe = activeBundle.signal.subscribe(debouncedTrigger);

    return () => {
      disposed = true;
      window.removeEventListener('focus', trigger);
      unsubscribe();
      if (debounceTimer !== undefined) clearTimeout(debounceTimer);
    };
  }, [isAuthenticated, bundle, injectedPort]);
}
