/**
 * habit-header.tsx — mobile Today habit band: streak ember + goal ring.
 *
 * Consumes useHabitSummary(); renders a calm skeleton while loading (no fake
 * numbers — invariant #1), then the two glanceable surfaces side-by-side.
 *
 * Card aesthetic matches ContinueReadingCard: bg-surface-raised, border-line,
 * rounded-2xl, generous padding. Token-only styling (invariant #6).
 */

import { View } from 'react-native';

import { GoalRing } from './goal-ring.js';
import { StreakEmber } from './streak-ember.js';
import { useHabitSummary } from './use-habit-summary.js';

// ── Skeleton ──────────────────────────────────────────────────────────────────

function HabitSkeleton() {
  return (
    <View
      className="bg-surface-raised border border-line rounded-2xl px-5 py-5"
      accessibilityState={{ busy: true }}
      accessibilityLabel="Loading habit summary"
    >
      <View className="flex-row items-center gap-4">
        {/* Ember placeholder */}
        <View className="flex-1 flex-row items-start gap-3">
          <View className="w-11 h-11 rounded-full bg-line" />
          <View className="flex-1 gap-1.5 pt-0.5">
            <View className="h-7 w-9 rounded bg-line" />
            <View className="h-3.5 w-16 rounded bg-line" />
            <View className="h-3 w-24 rounded bg-line" />
          </View>
        </View>

        {/* Divider */}
        <View className="self-stretch w-px bg-line" />

        {/* Ring placeholder */}
        <View className="rounded-full bg-line" style={{ width: 88, height: 88 }} />
      </View>
    </View>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function HabitHeader() {
  const { view, loading } = useHabitSummary();

  if (loading) {
    return <HabitSkeleton />;
  }

  return (
    <View className="bg-surface-raised border border-line rounded-2xl px-5 py-5">
      <View className="flex-row items-center gap-4">
        {/* Streak ember — expressive, takes the remaining width */}
        <View className="flex-1 min-w-0">
          <StreakEmber view={view} />
        </View>

        {/* Vertical divider */}
        <View className="self-stretch w-px bg-line" />

        {/* Goal ring — precise, informational */}
        <View className="shrink-0">
          <GoalRing view={view} />
        </View>
      </View>
    </View>
  );
}
