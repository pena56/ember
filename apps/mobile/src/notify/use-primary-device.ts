/**
 * use-primary-device.ts — thin RN hook for primary push-device selection.
 *
 * Mirrors use-push-enablement.ts exactly for gating / lazy-port / useFocusEffect
 * pattern. All decision logic defers to deriveDevicePickerRows (pure, testable
 * seam in device-picker-rows.ts).
 *
 * Untested thin glue (typecheck-only, consistent with use-push-enablement /
 * use-notification-preferences being untested).
 *
 * Invariants:
 *  #1  Convex reads are async + fail-soft, off the render path (useFocusEffect).
 *      setPrimary is optimistic + fire-and-forget — no Convex on the render path.
 *  #5  Zero decision logic here — order/marking deferred to deriveDevicePickerRows.
 *  #6  No styling here — UI layer owns tokens.
 *  #7  Server enforces exactly-one-primary; client just designates the preference.
 *
 * Gating: identical to use-push-enablement — requires isAuthenticated + bundle !== null.
 * When ungated: setPrimary is a no-op; devices stays [].
 */

import { useConvexAuth } from 'convex/react';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useSyncBundle } from '../store/store-context.js';

import type { NotificationPort, NotificationStateDevice } from './notification-port.js';

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface PrimaryDeviceResult {
  /** All devices for the owner (full shape from getNotificationState). Seeded []. */
  devices: NotificationStateDevice[];
  /** This device's deviceId from the sync bundle, or null when ungated. */
  currentDeviceId: string | null;
  /**
   * Wall-clock captured at the last focus refresh, for relative last-seen copy.
   * Captured here (off the render path) so the screen stays pure — the lint
   * rule forbids calling Date.now() during render. Refreshes with the device
   * list, which is exactly when the last-seen values change.
   */
  nowMs: number;
  /** True once isAuthenticated and bundle are both present. */
  ready: boolean;
  /** Optimistically designate a device as primary; fire-and-forget to convex. */
  setPrimary: (deviceId: string) => void;
}

export function usePrimaryDevice(opts?: { port?: NotificationPort }): PrimaryDeviceResult {
  const { isAuthenticated } = useConvexAuth();
  const bundle = useSyncBundle();

  const [devices, setDevices] = useState<NotificationStateDevice[]>([]);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // ── Lazy port singleton (identical pattern to use-push-enablement) ─────────

  const injectedPort = opts?.port;
  // Lazily-resolved port singleton, kept in a ref so it survives re-renders
  // (mirrors use-push-enablement's lazy import; guards concurrent import races).
  const portPromiseRef = useRef<Promise<NotificationPort> | undefined>(undefined);

  const getPort = useCallback((): Promise<NotificationPort> => {
    if (injectedPort) return Promise.resolve(injectedPort);
    portPromiseRef.current ??= Promise.all([
      import('../convex/convex-client.js'),
      import('./convex-notification-port.js'),
    ]).then(([{ convex }, { createConvexNotificationPort }]) => {
      if (convex === null) {
        return Promise.reject(new Error('[usePrimaryDevice] convex client is null'));
      }
      return createConvexNotificationPort(convex);
    });
    return portPromiseRef.current;
  }, [injectedPort]);

  // ── Refresh: read the owner's full device list from the server ─────────────
  // Async + fail-soft + off the render path (invariant #1). Reads the
  // notification registration state (not document/reading data path) on focus.
  // Offline / null convex keeps the current devices list.

  const refresh = useCallback(() => {
    void (async () => {
      if (!isAuthenticated || bundle === null) return;
      try {
        const port = await getPort();
        const { devices: fetched } = await port.getNotificationState();
        setDevices(fetched);
        // Capture the clock alongside the fresh list (off the render path).
        setNowMs(Date.now());
      } catch { /* fail-soft: offline / null convex — keep current list */ }
    })();
  }, [isAuthenticated, bundle, getPort]);

  // ── Re-read on focus (same class as use-push-enablement) ──────────────────
  // useFocusEffect so returning to the Settings modal re-reads the live state
  // without requiring a second tap.

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // ── setPrimary: optimistic update + fire-and-forget ────────────────────────
  // Immediately marks the chosen device as primary locally (others set to false)
  // so the radio group updates without waiting for the round-trip. The server
  // enforces exactly-one-primary; a focus re-read will reconcile on re-entry
  // (invariant #1 — no Convex on the render path).

  const setPrimary = useCallback((deviceId: string) => {
    // Gate: no auth or no bundle → no-op.
    if (!isAuthenticated || bundle === null) return;

    // Optimistic update: flip exactly the chosen device's isPrimary.
    setDevices((prev) =>
      prev.map((d) => ({ ...d, isPrimary: d.deviceId === deviceId })),
    );

    // Fire-and-forget — fail-soft; a focus re-read reconciles.
    void getPort()
      .then((port) => port.setPrimaryDevice({ deviceId }))
      .catch(() => {});
  }, [isAuthenticated, bundle, getPort]);

  return {
    devices,
    currentDeviceId: bundle?.deviceId ?? null,
    nowMs,
    ready: isAuthenticated && bundle !== null,
    setPrimary,
  };
}
