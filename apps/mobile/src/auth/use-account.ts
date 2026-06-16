/**
 * use-account.ts — derives a presentational account view from Convex auth.
 *
 * Returns { status: 'loading' | 'anonymous' | 'claimed', email } — the small
 * contract consumed by AccountButton and AccountSheet.
 *
 * Keeps the two Convex hooks (useConvexAuth, useQuery) isolated here so
 * components can be tested by mocking just this hook.
 */

import { useConvexAuth, useQuery } from 'convex/react';

import { api } from '@ember/convex/_generated/api';

import type { AccountView } from './derive-account-view.js';
import { deriveAccountView } from './derive-account-view.js';

export type { AccountView };

export function useAccount(): AccountView {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.currentUser);

  return deriveAccountView({ isLoading, isAuthenticated, user: user ?? null });
}
