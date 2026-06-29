/**
 * use-notification-handlers.ts — mount foreground handler + tap responder once.
 *
 * Thin, untested glue. Called from AnonymousAuthGate in _layout.tsx after
 * useNotificationSync() — same Convex-auth scope. Renders nothing.
 *
 * - setForegroundHandler() is global (idempotent on re-call); safe unconditionally.
 * - addTapResponder routes taps to the Today tab via router.push('/(tabs)').
 *
 * The unsubscribe is returned in useEffect cleanup so the listener doesn't leak
 * on unmount (e.g. when AnonymousAuthGate is torn down in offline-local mode).
 */

import { router } from 'expo-router';
import { useEffect } from 'react';

import { addTapResponder, setForegroundHandler } from './native-notifications.js';

export function useNotificationHandlers(): void {
  useEffect(() => {
    // Set the global foreground display policy once on mount.
    setForegroundHandler();

    // Register the tap responder — navigate to Today tab when user taps a push.
    const unsubscribe = addTapResponder(() => {
      router.push('/(tabs)');
    });

    return unsubscribe;
  }, []);
}
