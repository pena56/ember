/**
 * account.tsx — modal route for the account sheet.
 *
 * Opened by AccountButton (router.push('/account')).
 * Presented as a modal (presentation: 'modal' set in _layout.tsx).
 * Dismisses via swipe/back or after a successful action (router.back()).
 *
 * Token-only styling (invariant #6).
 */

import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountSheet } from '../src/auth/account-sheet.js';
import { convex } from '../src/convex/convex-client.js';

export default function AccountScreen() {
  // Defensive: offline-local (no EXPO_PUBLIC_CONVEX_URL) has no ConvexAuthProvider,
  // so AccountSheet's convex hooks would throw. The header button is hidden in this
  // mode, but guard the route directly too (invariant #1 — never crash without auth).
  if (convex === null) {
    return <Redirect href="/library" />;
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface">
      <AccountSheet />
    </SafeAreaView>
  );
}
