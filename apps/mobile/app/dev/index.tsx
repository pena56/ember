/**
 * app/dev/index.tsx — developer verification screens index.
 *
 * Reachable via the __DEV__ home link on the Today tab.
 * Lists all device-verify screens for manual testing.
 *
 * DELETE the entries (and corresponding screen files) once each unit is
 * confirmed green on device — the real adapters stay.
 */

import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const DEV_SCREENS: { title: string; route: string }[] = [
  { title: 'Unit 13d — Blob-sync wiring', route: '/dev/blob-sync-13d' },
];

export default function DevIndex() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-surface">
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View className="px-6 py-4 border-b border-line">
          <Text className="font-serif text-2xl text-text" accessibilityRole="header">
            Dev screens
          </Text>
          <Text className="font-sans text-sm text-text-muted mt-1">
            Throwaway device-verify screens. Delete once green.
          </Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
          {DEV_SCREENS.map(({ title, route }) => (
            <Pressable
              key={route}
              onPress={() => { router.push(route as Parameters<typeof router.push>[0]); }}
              accessibilityRole="button"
              accessibilityLabel={title}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <View className="px-5 py-4 bg-surface-raised rounded-lg border border-line">
                <Text className="font-sans text-base text-text">{title}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
