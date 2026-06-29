/**
 * use-push-enablement.ts — thin RN hook for push-notification enablement.
 *
 * Mirrors use-notification-sync.ts exactly for gating / lazy-port pattern.
 * All decision logic defers to derivePushControlState (pure, testable seam).
 *
 * Untested thin glue (like use-reconciler / use-notification-sync) — covered
 * by typecheck only. Native calls are isolated in native-notifications.ts.
 *
 * Invariants:
 *  #1  Reads stay local; the only write is registerDevice (fail-soft, off render path).
 *  #5  Zero decision logic here — defers to derivePushControlState.
 *  #6  No styling here — UI layer owns tokens.
 *  #7  Server still elects/dedupes; client never fires a push directly.
 *
 * Gating: same as useNotificationSync — requires isAuthenticated + bundle !== null.
 * When ungated: enable() is a no-op; state stays { enabled:false, primaryAction:'request' }.
 */

import { useConvexAuth } from 'convex/react';
import Constants from 'expo-constants';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';

import { useSyncBundle } from '../store/store-context.js';

import {
  acquireExpoPushToken,
  ensureAndroidChannel,
  getPermissionStatus,
  requestPermission,
} from './native-notifications.js';
import type { NotificationPort } from './notification-port.js';
import {
  derivePushControlState,
  type PushControlState,
} from './push-control-state.js';

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface PushEnablementResult {
  state: PushControlState;
  enable: () => void;
  refresh: () => void;
}

export function usePushEnablement(opts?: { port?: NotificationPort }): PushEnablementResult {
  const { isAuthenticated } = useConvexAuth();
  const bundle = useSyncBundle();

  // Local tracking of whether a token has been acquired this session.
  // When the hook mounts it reads permission status; hasToken is tracked locally
  // after a successful enable() call (no Convex read on the render path — invariant #1).
  const [hasToken, setHasToken] = useState(false);
  const [permission, setPermission] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');

  const state = derivePushControlState({ permission, hasToken });

  // ── Lazy port singleton (identical pattern to use-notification-sync) ──────

  const injectedPort = opts?.port;
  // Lazily-resolved port singleton, kept in a ref so it survives re-renders
  // (mirrors use-notification-sync's lazy import; guards concurrent import races).
  const portPromiseRef = useRef<Promise<NotificationPort> | undefined>(undefined);

  const getPort = useCallback((): Promise<NotificationPort> => {
    if (injectedPort) return Promise.resolve(injectedPort);
    portPromiseRef.current ??= Promise.all([
      import('../convex/convex-client.js'),
      import('./convex-notification-port.js'),
    ]).then(([{ convex }, { createConvexNotificationPort }]) => {
      if (convex === null) {
        return Promise.reject(new Error('[usePushEnablement] convex client is null'));
      }
      return createConvexNotificationPort(convex);
    });
    return portPromiseRef.current;
  }, [injectedPort]);

  // ── Refresh: re-read the OS permission status ─────────────────────────────

  const refresh = useCallback(() => {
    void getPermissionStatus().then(setPermission).catch(() => { /* fail-soft */ });
  }, []);

  // ── Read permission on mount and on focus ──────────────────────────────────

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── enable() ─────────────────────────────────────────────────────────────

  const enable = useCallback(() => {
    // Gate: no auth or no bundle → no-op
    if (!isAuthenticated || bundle === null) return;
    const activeBundle = bundle;

    void (async () => {
      try {
        // If hard-denied → deep-link to OS Settings
        if (state.primaryAction === 'open-settings') {
          await Linking.openSettings();
          return;
        }

        // Request permission (or re-acquire token if already granted)
        const status = await requestPermission();
        setPermission(status);

        if (status !== 'granted') return;

        await ensureAndroidChannel();

        // Acquire token — requires an EAS projectId in Constants.expoConfig.extra.eas.projectId.
        // Fail-softs to null when absent (projectId-less dev builds, simulator, offline).
        const projectId: string | undefined =
          (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
            ?.projectId;

        const token = projectId ? await acquireExpoPushToken(projectId) : null;

        // Register device — always with platform; include token when available.
        const port = await getPort();
        await port.registerDevice({
          deviceId: activeBundle.deviceId,
          platform: Platform.OS as 'ios' | 'android',
          ...(token !== null ? { expoPushToken: token } : {}),
        });

        if (token !== null) {
          setHasToken(true);
        }

        refresh();
      } catch {
        // Fail-soft: any error leaves the toggle off; user can retry.
      }
    })();
  }, [isAuthenticated, bundle, state.primaryAction, getPort, refresh]);

  return { state, enable, refresh };
}
