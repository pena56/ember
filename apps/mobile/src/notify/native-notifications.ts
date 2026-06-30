/**
 * native-notifications.ts — thin, untested expo-notifications wrapper.
 *
 * THE ONLY module that imports expo-notifications directly. Everything else
 * depends on this module so the testable logic (push-control-state.ts,
 * use-push-enablement.ts) stays free of native imports.
 *
 * Exposes six primitives:
 *  - getPermissionStatus   — read current OS permission state
 *  - requestPermission     — prompt the OS permission sheet (iOS shows once)
 *  - acquireExpoPushToken  — mint an Expo push token; fail-soft → null
 *  - ensureAndroidChannel  — create the default notification channel on Android
 *  - setForegroundHandler  — show banners while the app is foregrounded
 *  - addTapResponder       — run a callback when the user taps a delivered push
 *
 * No decision logic. No test coverage (typecheck + device acceptance cover this).
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { PermissionStatus } from './push-control-state.js';

// ── Permission helpers ────────────────────────────────────────────────────────

function mapStatus(granted: boolean, canAskAgain: boolean): PermissionStatus {
  if (granted) return 'granted';
  // canAskAgain === false → hard-denied (iOS has shown sheet; user must go to Settings)
  if (!canAskAgain) return 'denied';
  return 'undetermined';
}

/** Read the current OS push permission state without prompting. */
export async function getPermissionStatus(): Promise<PermissionStatus> {
  try {
    const { granted, canAskAgain, ios } = await Notifications.getPermissionsAsync();
    // iOS provisional is treated as granted (user sees no sheet, but app can post quietly)
    const effectiveGranted = granted || ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    return mapStatus(effectiveGranted, canAskAgain);
  } catch {
    return 'undetermined';
  }
}

/** Prompt the OS push permission sheet. On iOS the sheet appears at most once. */
export async function requestPermission(): Promise<PermissionStatus> {
  try {
    const { granted, canAskAgain } = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: false },
    });
    return mapStatus(granted, canAskAgain);
  } catch {
    return 'undetermined';
  }
}

// ── Token acquisition ─────────────────────────────────────────────────────────

/**
 * Acquire an Expo push token for the given EAS project id.
 * Returns null when:
 *  - projectId is absent / empty
 *  - running in the iOS simulator (simulator tokens are invalid)
 *  - network is unavailable
 *  - any other transient failure
 *
 * Callers treat null as "token unavailable, leave toggle off, no crash".
 */
export async function acquireExpoPushToken(
  projectId: string,
  opts?: { retries?: number; baseDelayMs?: number },
): Promise<string | null> {
  if (!projectId) {
    console.warn('[native-notifications] acquireExpoPushToken: no projectId — token unavailable');
    return null;
  }
  // FCM/APNs registration can fail transiently right after install (e.g. Android
  // SERVICE_NOT_AVAILABLE while Play Services finishes registering). Google's
  // guidance for that class of error is retry-with-backoff, so try a few times
  // before giving up. A hard misconfig (no google-services.json) still fails fast
  // on every attempt and ends up null — callers leave the toggle off, no crash.
  const retries = opts?.retries ?? 3;
  const baseDelayMs = opts?.baseDelayMs ?? 1000;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
      return data ?? null;
    } catch (error) {
      const isLast = attempt === retries;
      console.warn(
        `[native-notifications] acquireExpoPushToken failed (attempt ${attempt + 1}/${retries + 1})` +
          `${isLast ? '' : ' — retrying'}:`,
        error,
      );
      if (isLast) return null;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));
    }
  }
  return null;
}

// ── Android channel ───────────────────────────────────────────────────────────

/**
 * Create (or update) the default notification channel on Android.
 * No-op on iOS (guarded by Platform.OS check).
 */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Ember Notifications',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

// ── Runtime handlers ──────────────────────────────────────────────────────────

/**
 * Configure the foreground notification handler so banners appear while the
 * app is open. Safe to call unconditionally (global, idempotent on re-call).
 *
 * shouldPlaySound: false and shouldSetBadge: false — Ember reads goals, not badges.
 */
export function setForegroundHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Register a tap-responder: called when the user taps a delivered push notification.
 * Returns an unsubscribe function to call on cleanup (useEffect return).
 */
export function addTapResponder(onTap: () => void): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener(() => {
    onTap();
  });
  return () => { subscription.remove(); };
}
