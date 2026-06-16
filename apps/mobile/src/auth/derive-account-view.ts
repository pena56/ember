/**
 * deriveAccountView — pure helper to map Convex auth state to an account view-model.
 *
 * Returns { status: 'loading' | 'anonymous' | 'claimed', email: string | undefined }.
 *
 * Mirrors the web use-account.ts contract. Extracted as a pure function so it can
 * be unit-tested without any React or platform dependencies.
 */

export interface UserRecord {
  isAnonymous: boolean;
  email: string | undefined;
}

export interface AccountView {
  status: 'loading' | 'anonymous' | 'claimed';
  email: string | undefined;
}

export interface DeriveAccountArgs {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: UserRecord | null | undefined;
}

export function deriveAccountView({ isLoading, isAuthenticated, user }: DeriveAccountArgs): AccountView {
  // Loading: either auth state is resolving or user query hasn't returned yet
  if (isLoading || user === undefined) {
    return { status: 'loading', email: undefined };
  }

  // Claimed: authenticated + user record exists + not an anonymous user
  if (isAuthenticated && user && !user.isAnonymous) {
    return { status: 'claimed', email: user.email };
  }

  // Anonymous: not authenticated, or is an anonymous user
  return { status: 'anonymous', email: undefined };
}
