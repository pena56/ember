import '../global.css'; // bootstraps uniwind's className runtime — required, not just metro cssEntryFile

import { Fraunces_400Regular, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { Inter_400Regular, Inter_500Medium } from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Toaster } from 'sonner-native';

import { AuthProviderGate } from '../src/auth/auth-provider-gate.js';
import { useAnonymousAuth } from '../src/auth/use-anonymous-auth.js';
import { convex, secureStorage } from '../src/convex/convex-client.js';
import { StoreProvider } from '../src/store/store-context.js';
import { useReconciler } from '../src/sync/use-reconciler.js';
import { ThemeProvider } from '../src/theme/theme-provider.js';
import { useTheme } from '../src/theme/use-theme.js';

// Anchor the root Stack on the tab group so the app launches into the tabs
// (Today/Library/Stats), NOT the account modal. Without this, the explicitly
// declared `account` screen becomes the initial route and opens on load —
// trapping the user in the (optional) account sheet with nothing to go back to.
export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// ── Anonymous auth trigger — mounted inside ConvexAuthProvider scope ──────────

/**
 * AnonymousAuthGate — anonymous auth + background sync. Calls useAnonymousAuth()
 * and useReconciler() so both hooks have access to the Convex auth context (via
 * ConvexAuthProvider above) and the store/sync-bundle context (below). Renders
 * null — no UI.
 *
 * When convex is null (missing env), ConvexAuthProvider is not mounted, so these
 * hooks would fail. We guard by not mounting this gate in that case — the app
 * simply runs offline-local, and the reconciler never mounts (invariant #1).
 */
function AnonymousAuthGate() {
  useAnonymousAuth();
  useReconciler();
  return null;
}

// ── Inner layout — needs ThemeProvider in scope to theme the Toaster ──────────

function InnerLayout() {
  const { preference } = useTheme();

  // Map ember theme preference → sonner-native theme token
  const toasterTheme =
    preference === 'warm-dark' ? 'dark' : preference === 'warm-light' ? 'light' : 'system';

  return (
    <StoreProvider>
      {/* Only trigger anonymous auth when the Convex client is present */}
      {convex !== null && <AnonymousAuthGate />}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="account" options={{ presentation: 'modal' }} />
      </Stack>
      {/* Toaster is placed outside/above the navigator per sonner-native docs */}
      <Toaster theme={toasterTheme} />
    </StoreProvider>
  );
}

// ── Root layout ───────────────────────────────────────────────────────────────

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'Fraunces Variable': Fraunces_400Regular,
    Fraunces: Fraunces_400Regular,
    'Fraunces-SemiBold': Fraunces_600SemiBold,
    Inter: Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/*
         * AuthProviderGate wraps ConvexAuthProvider (when client is non-null) and
         * exposes resetAuthClient() for the claim-reactivity remount pattern.
         * ThemeProvider is inside (auth is app-wide; theme stays independent).
         * When convex is null (missing EXPO_PUBLIC_CONVEX_URL), the gate renders
         * children without a provider — offline-local mode (invariant #1).
         *
         * storageNamespace: "ember-auth" is SecureStore-key-safe ([A-Za-z0-9._-]).
         * Do NOT use the raw deployment URL — it contains `:/.` chars that are
         * invalid in SecureStore keys.
         */}
        <AuthProviderGate
          client={convex}
          storage={secureStorage}
          storageNamespace="ember-auth"
        >
          <ThemeProvider>
            <InnerLayout />
          </ThemeProvider>
        </AuthProviderGate>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
