/**
 * auth-provider-gate-reducer.ts — pure reducer for the remount key.
 *
 * Extracted from auth-provider-gate.tsx so it can be unit-tested without
 * React or any platform dep. The gate uses useReducer(authKeyReducer, 0).
 */

export type AuthKeyAction = 'reset';

export function authKeyReducer(key: number, action: AuthKeyAction): number {
  if (action === 'reset') return key + 1;
  return key;
}
