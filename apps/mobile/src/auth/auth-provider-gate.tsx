/**
 * auth-provider-gate.tsx — key-remount gate for claim/sign-in reactivity.
 *
 * After an anonymous → password claim, @convex-dev/auth's isAuthenticated never
 * flips (both states have a non-null token), so ConvexProviderWithAuth never
 * re-calls client.setAuth with the new identity. The fix: remount the entire
 * ConvexAuthProvider subtree by bumping a React key — the remounted provider
 * re-reads the (now password) token from SecureStore and re-runs setAuth, so
 * all live queries re-bind to the claimed identity.
 *
 * Sign-out flips token → null (a real status change) so it stays reactive
 * without a remount.
 *
 * The account sheet calls resetAuthClient() after a successful claim/sign-in.
 * Module state survives the React remount (no JS-bundle reload), so success
 * toasts can be shown directly — no sessionStorage shuttle needed.
 */

import { ConvexAuthProvider } from '@convex-dev/auth/react';
import type { TokenStorage } from '@convex-dev/auth/react';
import { ConvexReactClient } from 'convex/react';
import { createContext, useContext, useReducer } from 'react';
import type { ReactNode } from 'react';

import { authKeyReducer } from './auth-provider-gate-reducer.js';

// Re-export for consumers (e.g. _layout.tsx) so they don't need a separate import
export type { TokenStorage };

// ── Context ───────────────────────────────────────────────────────────────────

interface AuthResetContext {
  resetAuthClient: () => void;
}

const AuthResetCtx = createContext<AuthResetContext | null>(null);

export function useAuthReset(): () => void {
  const ctx = useContext(AuthResetCtx);
  if (!ctx) throw new Error('useAuthReset must be used inside AuthProviderGate');
  return ctx.resetAuthClient;
}

// ── Gate ──────────────────────────────────────────────────────────────────────

interface AuthProviderGateProps {
  /** The Convex client (may be null if EXPO_PUBLIC_CONVEX_URL is unset). */
  client: ConvexReactClient | null;
  storage: TokenStorage;
  storageNamespace: string;
  children: ReactNode;
}

export function AuthProviderGate({
  client,
  storage,
  storageNamespace,
  children,
}: AuthProviderGateProps) {
  const [key, dispatch] = useReducer(authKeyReducer, 0);

  function resetAuthClient() {
    dispatch('reset');
  }

  const ctx: AuthResetContext = { resetAuthClient };

  // When the Convex client is null (missing env), render children directly —
  // the app runs offline-local without an auth provider (invariant #1).
  if (!client) {
    return (
      <AuthResetCtx.Provider value={ctx}>
        {children}
      </AuthResetCtx.Provider>
    );
  }

  return (
    <AuthResetCtx.Provider value={ctx}>
      <ConvexAuthProvider
        key={key}
        client={client}
        storage={storage}
        storageNamespace={storageNamespace}
      >
        {children}
      </ConvexAuthProvider>
    </AuthResetCtx.Provider>
  );
}
