/**
 * use-anonymous-auth.ts — anonymous auto-sign-in hook (mobile / expo-network).
 *
 * Mobile analog of the web 11b hook. Signs in anonymously exactly once per
 * online-transition when:
 *   - isLoading is false
 *   - isAuthenticated is false
 *   - Network is online (expo-network, not navigator.onLine)
 *
 * A ref guards against React StrictMode's double-invoke. A network-state
 * listener retries if connectivity returns while the component is mounted.
 * Cleans up the subscription on unmount. Once a session is active the guard
 * is cleared, so a later sign-out re-anonymizes on the next connected tick
 * without requiring an app reload (11b regression fix — carried forward).
 *
 * Call this hook once high in the tree (e.g. in InnerLayout). No UI rendered.
 */

import { useAuthActions } from '@convex-dev/auth/react';
import { useConvexAuth } from 'convex/react';
import * as Network from 'expo-network';
import { useEffect, useRef } from 'react';

import { shouldSignInAnonymously } from './should-sign-in-anonymously.js';

export function useAnonymousAuth() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn } = useAuthActions();
  // Guard against StrictMode double-fire and repeated calls on the same cycle
  const hasFiredRef = useRef(false);

  useEffect(() => {
    // A session is active: clear the guard so a subsequent sign-out can
    // re-anonymize. Done here (after isAuthenticated flips true) rather than
    // in trySignIn so the guard still blocks double-fire while the initial
    // anonymous sign-in is mid-flight (isAuthenticated still false).
    if (isAuthenticated) {
      hasFiredRef.current = false;
      return;
    }

    let cancelled = false;

    async function trySignIn(online?: boolean) {
      if (cancelled) return;

      // If online state not provided, fetch it
      let isOnline = online;
      if (isOnline === undefined) {
        const state = await Network.getNetworkStateAsync();
        isOnline = state.isConnected ?? false;
      }

      if (cancelled) return;

      if (!shouldSignInAnonymously({ isLoading, isAuthenticated, online: isOnline, hasFired: hasFiredRef.current })) {
        return;
      }

      hasFiredRef.current = true;
      void signIn('anonymous');
    }

    // Initial check
    void trySignIn();

    // Subscribe to network-state changes to retry when connectivity returns
    const subscription = Network.addNetworkStateListener((state) => {
      void trySignIn(state.isConnected ?? false);
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [isLoading, isAuthenticated, signIn]);
}
