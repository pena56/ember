/**
 * use-primary-device.ts — thin web hook for the push-device picker.
 *
 * Web analog of mobile's use-primary-device.ts, using web idioms:
 *  - Lazy convex port singleton via the same getPort() pattern as
 *    use-notification-sync.ts (import('../convex/convex-client.js') +
 *    import('./convex-notification-port.js'), kept in a ref).
 *  - Mount load + window 'focus' re-read (NOT useFocusEffect — that's
 *    expo-router; web uses window.addEventListener).
 *  - Optimistic setPrimary: immediately updates local devices so exactly the
 *    chosen row has isPrimary: true, then fire-and-forget the mutation.
 *
 * Invariants:
 *  #1  No Convex on the render path — all reads/writes are async, off-render,
 *      fail-soft. A load failure keeps the current device list unchanged.
 *  #5  Zero order/marking logic here — that lives entirely in
 *      deriveDevicePickerRows (the single decision seam).
 *  #6  No styling.
 *
 * No `convex === null` guard needed (web-specific): apps/web's convex-client.ts
 * throws at import if VITE_CONVEX_URL is unset — web has no offline-local
 * no-convex mode (unlike mobile). Mirror use-notification-sync which passes
 * `convex` straight through without a null check.
 *
 * Untested thin glue (typecheck-only), consistent with use-notification-preferences
 * being untested. An injected { port } prop is accepted for test symmetry.
 */

import { useConvexAuth } from 'convex/react';
import { useEffect, useRef, useState } from 'react';

import type { NotificationPort, NotificationStateDevice } from '../notify/use-notification-sync.js';
import { useSyncBundle } from '../store/store-context.js';

// ── Result type ───────────────────────────────────────────────────────────────

export interface PrimaryDeviceResult {
  devices: NotificationStateDevice[];
  currentDeviceId: string | null;
  /** Epoch-ms captured on last refresh — pass to the card as a prop, never call Date.now() in render. */
  nowMs: number;
  /** True once authenticated and a sync bundle exists. */
  ready: boolean;
  /** Optimistic primary-device selection — fire-and-forget; focus re-read reconciles. */
  setPrimary: (deviceId: string) => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePrimaryDevice(opts?: { port?: NotificationPort }): PrimaryDeviceResult {
  const { isAuthenticated } = useConvexAuth();
  const bundle = useSyncBundle();

  const [devices, setDevices] = useState<NotificationStateDevice[]>([]);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const injectedPort = opts?.port;

  // Lazy port singleton ref — survives re-renders without triggering effect deps.
  const portPromiseRef = useRef<Promise<NotificationPort> | undefined>(undefined);

  const getPort = (): Promise<NotificationPort> => {
    if (injectedPort) return Promise.resolve(injectedPort);
    portPromiseRef.current ??= Promise.all([
      import('../convex/convex-client.js'),
      import('../notify/convex-notification-port.js'),
    ]).then(([{ convex }, { createConvexNotificationPort }]) =>
      createConvexNotificationPort(convex),
    );
    return portPromiseRef.current;
  };

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      if (!isAuthenticated || bundle === null) return;
      try {
        const port = await getPort();
        if (cancelled) return;
        const { devices: fetched } = await port.getNotificationState();
        if (cancelled) return;
        setDevices(fetched);
        setNowMs(Date.now());
      } catch {
        // Fail-soft: keep current device list; focus re-read retries.
      }
    };

    void load();

    const handleFocus = (): void => {
      void load();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', handleFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, bundle, injectedPort]);

  const setPrimary = (deviceId: string): void => {
    if (!isAuthenticated || bundle === null) return;

    // Optimistic update — flip isPrimary in local state immediately.
    setDevices((prev) =>
      prev.map((d) => ({ ...d, isPrimary: d.deviceId === deviceId })),
    );

    // Fire-and-forget; fail-soft; focus re-read reconciles.
    void getPort()
      .then((port) => port.setPrimaryDevice({ deviceId }))
      .catch(() => {});
  };

  return {
    devices,
    currentDeviceId: bundle?.deviceId ?? null,
    nowMs,
    ready: isAuthenticated && bundle !== null,
    setPrimary,
  };
}
