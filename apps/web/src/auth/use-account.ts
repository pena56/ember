/**
 * use-account.ts — derives a presentational account view from Convex auth.
 *
 * Returns { status: 'loading' | 'anonymous' | 'claimed', email } — the small
 * contract consumed by AccountMenu and AuthDialog.
 *
 * Keeps the two convex hooks (useConvexAuth, useQuery) isolated here so
 * components can be tested by mocking just this hook.
 */

import { useConvexAuth, useQuery } from 'convex/react';

import { api } from '@ember/convex/_generated/api';

export interface AccountState {
  status: 'loading' | 'anonymous' | 'claimed';
  email: string | undefined;
}

export function useAccount(): AccountState {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.currentUser);

  if (isLoading || user === undefined) {
    return { status: 'loading', email: undefined };
  }

  if (isAuthenticated && user && !user.isAnonymous) {
    return { status: 'claimed', email: user.email };
  }

  return { status: 'anonymous', email: undefined };
}
