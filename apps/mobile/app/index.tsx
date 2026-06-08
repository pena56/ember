import { Pressable, Text, View } from 'react-native';

import type { ThemePreference } from '../src/theme/resolve-app-theme.js';
import { useTheme } from '../src/theme/use-theme.js';

type SegmentOption = {
  label: string;
  value: ThemePreference;
};

const SEGMENTS: SegmentOption[] = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'warm-light' },
  { label: 'Dark', value: 'warm-dark' },
];

export default function HomeScreen() {
  const { preference, setPreference } = useTheme();

  return (
    <View className="flex-1 bg-surface items-center justify-center px-6 gap-8">
      {/* Wordmark */}
      <Text className="font-serif text-4xl text-text" accessibilityRole="header">
        Ember
      </Text>

      {/* Body */}
      <Text className="font-sans text-base text-text-muted text-center">
        Your personal reading companion.
      </Text>

      {/* Segmented theme control */}
      <View
        className="flex-row rounded-md border border-line overflow-hidden bg-surface-raised"
        accessibilityRole="radiogroup"
        accessibilityLabel="Theme"
      >
        {SEGMENTS.map(({ label, value }) => {
          const isActive = preference === value;
          return (
            <Pressable
              key={value}
              className={
                isActive
                  ? 'px-4 py-2 border-b-2 border-accent'
                  : 'px-4 py-2 border-b-2 border-transparent'
              }
              onPress={() => setPreference(value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: isActive }}
              accessibilityLabel={label}
            >
              <Text
                className={
                  isActive
                    ? 'font-sans text-sm text-text font-medium'
                    : 'font-sans text-sm text-text-muted'
                }
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
