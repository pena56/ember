/**
 * convex-client.ts — Convex client + SecureStore token storage adapter.
 *
 * Missing EXPO_PUBLIC_CONVEX_URL is non-fatal (invariant #1): convex is null →
 * the app runs entirely offline-local. Providers and anonymous sign-in are
 * skipped; the local SQLite store remains the source of truth.
 */

import { ConvexReactClient } from 'convex/react';
import * as SecureStore from 'expo-secure-store';

const url = process.env.EXPO_PUBLIC_CONVEX_URL;

if (!url) {
  console.warn(
    '[Ember] EXPO_PUBLIC_CONVEX_URL is not set — running offline-local only. ' +
      'Set it in apps/mobile/.env.local and restart Metro (clear cache) to enable sync.',
  );
}

/**
 * The Convex client, or null when EXPO_PUBLIC_CONVEX_URL is unset.
 * Consumers must guard: if (!convex) { /* offline-local path *\/ }
 */
export const convex: ConvexReactClient | null = url ? new ConvexReactClient(url) : null;

/**
 * SecureStore adapter that satisfies @convex-dev/auth's TokenStorage interface.
 *
 * SecureStore key constraint: [A-Za-z0-9._-] only. The storageNamespace
 * passed to ConvexAuthProvider ("ember-auth") already satisfies this, but
 * the library prefixes keys with it — keep the namespace slug-safe.
 *
 * Value size: ~2 KB limit per key. JWTs and refresh tokens are ~1–2 KB;
 * watch for warnings in the device gate if sessions grow.
 */
export const secureStorage = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};
