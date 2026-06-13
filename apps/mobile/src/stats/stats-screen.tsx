/**
 * stats-screen.tsx — the Stats tab: a calm, glanceable analytics overview.
 *
 * Six sections (top→bottom): Streak / Activity heatmap / Totals + speed /
 * Time of day / Your books. Everything is DERIVED from on-device sessions
 * (invariant #3) via useStats; renders offline (invariant #1).
 *
 * Mirrors today-screen.tsx's shell: page bg on a core View → SafeAreaView →
 * ScrollView → padded column. Fraunces heading anchor, Inter labels.
 * loading → calm skeleton (no fake numbers); !hasData → warm empty state.
 * Token-only styling (invariant #6).
 */

import type { ColorValue } from 'react-native';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Path, Svg } from 'react-native-svg';
import { useResolveClassNames } from 'uniwind';

import { ActivityHeatmap } from './activity-heatmap.js';
import { BookProgressList } from './book-progress-list.js';
import { StreakStat } from './streak-stat.js';
import { TimeOfDayStat } from './time-of-day-stat.js';
import { TotalsStat } from './totals-stat.js';
import { useStats } from './use-stats.js';

// ── Skeleton ──────────────────────────────────────────────────────────────────

/** A single card-shaped placeholder block. No fake numbers — just bg-line shapes. */
function SkeletonCard({ lines }: { lines: number }) {
  return (
    <View className="bg-surface-raised border border-line rounded-2xl px-5 py-5 gap-3">
      <View className="h-3 w-16 bg-line rounded" />
      {Array.from({ length: lines }).map((_, i) => (
        <View key={i} className="h-4 w-full bg-line rounded" />
      ))}
    </View>
  );
}

function StatsSkeleton() {
  return (
    <View
      className="gap-4"
      accessibilityLabel="Loading your reading stats"
      accessibilityState={{ busy: true }}
    >
      <SkeletonCard lines={2} />
      <SkeletonCard lines={3} />
      <SkeletonCard lines={2} />
      <SkeletonCard lines={4} />
    </View>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────────

function StatsEmpty() {
  const emberColor = useResolveClassNames('text-text-muted').color as ColorValue;
  return (
    <View className="items-center justify-center py-16 gap-4">
      {/* Quiet ember mark — decorative */}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ opacity: 0.3 }}>
        <Svg width={32} height={40} viewBox="0 0 44 56" fill="none">
          <Path
            d="M22 2C22 2 6 18 6 32C6 41.941 13.163 50 22 50C30.837 50 38 41.941 38 32C38 22 30 14 27 8C27 8 26 20 22 23C18 20 22 2 22 2Z"
            fill={emberColor}
          />
          <Path
            d="M22 23C22 23 14 31 14 37C14 41.418 17.582 45 22 45C26.418 45 30 41.418 30 37C30 31 22 23 22 23Z"
            fill={emberColor}
            fillOpacity={0.4}
          />
        </Svg>
      </View>
      <View className="gap-2 items-center">
        <Text className="font-serif text-xl text-text leading-snug text-center">
          Your story starts with a single page.
        </Text>
        <Text className="font-sans text-sm text-text-muted leading-relaxed text-center" style={{ maxWidth: 280 }}>
          Open a book to begin — your reading patterns will appear here.
        </Text>
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export function StatsScreen() {
  const { view, loading } = useStats();

  return (
    // Page bg on a core View — uniwind className is a no-op on SafeAreaView (02d carry-forward)
    <View className="flex-1 bg-surface">
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View className="px-6 py-10 gap-9">

            {/* Heading block */}
            <View className="gap-1.5">
              <Text
                className="font-serif text-4xl text-text leading-tight"
                accessibilityRole="header"
              >
                Your reading
              </Text>
              <Text className="font-sans text-sm text-text-muted mt-0.5">
                A quiet record of the time you&apos;ve spent with books.
              </Text>
            </View>

            {/* Thin separator — matches Today's rhythm */}
            <View
              className="h-px w-12 bg-line"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />

            {/* Content */}
            {loading ? (
              <StatsSkeleton />
            ) : !view.hasData ? (
              <StatsEmpty />
            ) : (
              <View className="gap-4">
                <StreakStat view={view} />
                <ActivityHeatmap view={view} />
                <TotalsStat view={view} />
                <TimeOfDayStat view={view} />
                <BookProgressList view={view} />
              </View>
            )}

          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
