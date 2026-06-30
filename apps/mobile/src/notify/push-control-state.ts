/**
 * push-control-state.ts — pure derivation of push-notification control state.
 *
 * No native imports — node-testable seam that drives the toggle UI.
 * Called by usePushEnablement to map (permission, hasToken) → UI state.
 *
 * Invariants:
 *  - #5 Zero hardcoded goal constants — no magic values.
 *  - #6 No styling — this is pure logic only.
 *  - Platform-free (no react-native / expo) — node-safe.
 */

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface PushControlState {
  /** Toggle reads ON only when granted AND a token is registered. */
  enabled: boolean;
  primaryAction: 'request' | 'open-settings' | 'none';
  /** true → the row's CTA deep-links to OS settings (permission hard-denied). */
  needsSystemSettings: boolean;
}

/**
 * Derive the push-notification control state from permission status + token presence.
 *
 * Rules (per spec §3):
 *  - undetermined → request permission (first-time prompt)
 *  - granted && hasToken → enabled (full flow complete)
 *  - granted && !hasToken → re-acquire token (grant present but token lost/missing)
 *  - denied → open OS settings (iOS only shows the system sheet once)
 */
export function derivePushControlState(input: {
  permission: PermissionStatus;
  hasToken: boolean;
}): PushControlState {
  const { permission, hasToken } = input;

  if (permission === 'denied') {
    return { enabled: false, primaryAction: 'open-settings', needsSystemSettings: true };
  }

  if (permission === 'granted' && hasToken) {
    return { enabled: true, primaryAction: 'none', needsSystemSettings: false };
  }

  // undetermined OR (granted && !hasToken) — both need the request path
  return { enabled: false, primaryAction: 'request', needsSystemSettings: false };
}
