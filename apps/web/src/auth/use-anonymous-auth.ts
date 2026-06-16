/**
 * use-anonymous-auth.ts — auto anonymous sign-in hook.
 *
 * Signs in anonymously exactly once per online-transition when:
 *   - isLoading is false
 *   - isAuthenticated is false
 *   - navigator.onLine is true
 *
 * A ref guards against React StrictMode's double-invoke. An `online` event
 * listener retries if connectivity returns while the component is mounted.
 * Cleans up the event listener on unmount. Once a session is active the guard
 * is cleared, so a later sign-out re-anonymizes on the next online tick
 * without requiring a page reload.
 *
 * Call this hook once high in the tree (e.g. in App). No UI is rendered.
 */

import { useAuthActions } from '@convex-dev/auth/react';
import { useConvexAuth } from 'convex/react';
import { useEffect, useRef } from 'react';

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

    function trySignIn() {
      if (isLoading || isAuthenticated || !navigator.onLine) return;
      if (hasFiredRef.current) return;
      hasFiredRef.current = true;
      void signIn('anonymous');
    }

    trySignIn();

    window.addEventListener('online', trySignIn);
    return () => {
      window.removeEventListener('online', trySignIn);
    };
  }, [isLoading, isAuthenticated, signIn]);
}
