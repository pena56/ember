import '../global.css'; // bootstraps uniwind's className runtime — required, not just metro cssEntryFile

import { Fraunces_400Regular, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { Inter_400Regular, Inter_500Medium } from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Toaster } from 'sonner-native';

import { StoreProvider } from '../src/store/store-context.js';
import { ThemeProvider } from '../src/theme/theme-provider.js';
import { useTheme } from '../src/theme/use-theme.js';

// ── Inner layout — needs ThemeProvider in scope to theme the Toaster ──────────

function InnerLayout() {
  const { preference } = useTheme();

  // Map ember theme preference → sonner-native theme token
  const toasterTheme =
    preference === 'warm-dark' ? 'dark' : preference === 'warm-light' ? 'light' : 'system';

  return (
    <StoreProvider>
      <Stack screenOptions={{ headerShown: false }} />
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
        <ThemeProvider>
          <InnerLayout />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
