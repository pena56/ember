/**
 * settings.tsx — modal route for the Settings screen.
 *
 * Opened by SettingsButton (router.push('/settings')).
 * Presented as a modal (presentation: 'modal' set in _layout.tsx).
 * Dismisses via swipe/back.
 *
 * The route owns usePushEnablement() and useNotificationPreferences() and passes
 * state + callbacks into the presentational <SettingsScreen/> (same hook-in-route
 * split as AccountSheet). No hooks in SettingsScreen itself.
 *
 * Token-only styling (invariant #6).
 */

import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { convex } from '../src/convex/convex-client.js';
import { useNotificationPreferences } from '../src/notify/use-notification-preferences.js';
import { usePrimaryDevice } from '../src/notify/use-primary-device.js';
import { usePushEnablement } from '../src/notify/use-push-enablement.js';
import { deriveDevicePickerRows } from '../src/settings/device-picker-rows.js';
import { SettingsScreen } from '../src/settings/settings-screen.js';

export default function SettingsRoute() {
  // Defensive: offline-local (no EXPO_PUBLIC_CONVEX_URL) has no ConvexAuthProvider,
  // so usePushEnablement's convex hooks would throw. The gear button is hidden in
  // that mode, but guard the route directly too (invariant #1 — never crash).
  if (convex === null) {
    return <Redirect href="/library" />;
  }

  return <SettingsRouteInner />;
}

// Inner component so hooks are only mounted when convex !== null (Redirect above
// returns before any hook runs — keeps hook order stable under the guard).
function SettingsRouteInner() {
  const { state, enable } = usePushEnablement();
  const { prefs, setEnabledType, setQuietHours } = useNotificationPreferences();
  const { devices, currentDeviceId, nowMs, setPrimary } = usePrimaryDevice();

  // Order/marking decided once, at the route, in the pure seam (invariant #5).
  const deviceRows = deriveDevicePickerRows({ devices, currentDeviceId });

  // bg-surface must live on a plain View (uniwind className paints it); the
  // native-stack modal's container defaults to a light background, so the token
  // on the View covers it in every theme. SafeAreaView handles insets only.
  return (
    <View className="flex-1 bg-surface">
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <SettingsScreen
          pushState={state}
          onEnablePush={enable}
          prefs={prefs}
          pushEnabled={state.enabled}
          onToggleType={setEnabledType}
          onChangeQuietHours={setQuietHours}
          devices={deviceRows}
          currentDeviceId={currentDeviceId}
          nowMs={nowMs}
          onSelectPrimary={setPrimary}
        />
      </SafeAreaView>
    </View>
  );
}
