/**
 * today-screen.tsx — the Today tab: time-of-day greeting + Continue Reading card.
 *
 * Quiet, literary voice. No streak ember, no goal ring, no fake numbers.
 * Same spacing language as LibraryScreen so Today + Library feel unified.
 *
 * Design: Fraunces greeting as emotional anchor; muted Inter date line;
 * token-tinted ActivityIndicator while the read resolves (invariant #6).
 */

import { useRouter } from 'expo-router';
import type { ColorValue } from 'react-native';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useResolveClassNames } from 'uniwind';

import { convex } from '../convex/convex-client.js';
import { SettingsButton } from '../settings/settings-button.js';

import { ContinueReadingCard } from './continue-reading-card.js';
import { HabitHeader } from './habit-header.js';
import { useContinueReading } from './use-continue-reading.js';

// ── Greeting helpers (mirrors web today-page.tsx logic verbatim) ──────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5)  return 'Still up?';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Quiet evening';
}

function getSubtitle(hasItems: boolean): string {
  if (hasItems) return 'Pick up where you left off.';
  return 'A good day to begin something new.';
}

function formatDate(): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());
}

// ── Screen ────────────────────────────────────────────────────────────────────

export function TodayScreen() {
  const router = useRouter();
  const { items, loading } = useContinueReading();
  // Token-driven spinner tint (invariant #6) — re-themes with light/dark
  const accent = useResolveClassNames('bg-accent').backgroundColor as ColorValue;

  const greeting = getGreeting();
  const topItem  = items[0];

  function handleResume(docId: string) {
    router.push(`/reader/${docId}`);
  }

  function handleBrowseLibrary() {
    router.navigate('/library');
  }

  return (
    // Page bg on a core View — uniwind className is a no-op on SafeAreaView (02d carry-forward)
    <View className="flex-1 bg-surface">
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {/* Header — gear opens Settings. Only when Convex is configured;
            offline-local has no provider above usePushEnablement (invariant #1). */}
        <View className="flex-row items-center justify-end px-6 py-3">
          {convex !== null && <SettingsButton />}
        </View>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
          showsVerticalScrollIndicator={false}
        >
          <View className="px-6 py-10 gap-9">

            {/* Greeting block */}
            <View className="gap-2">
              {/* Date — quiet, muted, contextual */}
              <Text className="font-sans text-xs font-medium uppercase tracking-widest text-text-muted">
                {formatDate()}
              </Text>

              {/* Greeting headline — Fraunces, emotional anchor */}
              <Text
                className="font-serif text-4xl text-text leading-tight"
                accessibilityRole="header"
              >
                {greeting}
              </Text>

              {/* Subtitle — only once Continue Reading has resolved (avoids a wrong copy flash) */}
              {!loading && (
                <Text className="font-sans text-sm text-text-muted mt-0.5">
                  {getSubtitle(items.length > 0)}
                </Text>
              )}
            </View>

            {/* Thin separator — matches web rhythm */}
            <View
              className="h-px w-12 bg-line"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />

            {/* Habit header — streak ember + today's goal ring. Owns its own
                loading (skeleton) via useHabitSummary, independent of the
                Continue Reading read below (spec 08c: don't couple the two). */}
            <View accessibilityLabel="Reading habit" accessibilityRole="none">
              <HabitHeader />
            </View>

            {/* Continue Reading section — scoped inline loading, never a full-screen gate */}
            {loading ? (
              <View
                className="items-center justify-center py-12"
                accessibilityRole="none"
                accessibilityState={{ busy: true }}
                accessibilityLabel="Loading your reading progress"
              >
                <ActivityIndicator size="small" color={accent} accessibilityElementsHidden />
              </View>
            ) : (
              <View accessibilityLabel="Continue reading" accessibilityRole="none">
                <ContinueReadingCard
                  item={topItem}
                  onResume={handleResume}
                  onBrowseLibrary={handleBrowseLibrary}
                />
              </View>
            )}

          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
