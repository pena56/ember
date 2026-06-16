/**
 * shouldSignInAnonymously — pure predicate for the anonymous auto-sign-in gate.
 *
 * Returns true only when all four conditions are met:
 *   1. Not in a loading state
 *   2. Not already authenticated
 *   3. Network is online
 *   4. Sign-in has not already been fired (ref guard)
 *
 * Extracted as a pure function so it can be unit-tested without any React or
 * platform dependencies.
 */

export interface ShouldSignInArgs {
  isLoading: boolean;
  isAuthenticated: boolean;
  online: boolean;
  hasFired: boolean;
}

export function shouldSignInAnonymously(args: ShouldSignInArgs): boolean {
  const { isLoading, isAuthenticated, online, hasFired } = args;
  return !isLoading && !isAuthenticated && online && !hasFired;
}
