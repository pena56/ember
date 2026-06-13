/**
 * streak-stat.tsx — current + longest streak display for the Stats tab.
 *
 * Fraunces hero numeral anchors the card. Status-aware color for the count.
 * Calmer than the Today ember — no goal ring, no flame motif here; just
 * the quiet factual record. Token-only styling (invariant #6).
 */

import { Text, View } from 'react-native';

import type { StatsView } from './present-stats.js';
import { StatCard } from './stat-card.js';

// ── Props ─────────────────────────────────────────────────────────────────────

interface StreakStatProps {
  view: StatsView;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StreakStat({ view }: StreakStatProps) {
  const { currentLabel, longestLabel, status } = view.streak;

  // Status-aware count color — token class strings
  const countColorClass =
    status === 'lit'
      ? 'text-streak-lit'
      : status === 'at-risk'
        ? 'text-streak-risk'
        : 'text-text-muted';

  // Hero number — extract digit portion for large display
  const isNumeric = currentLabel !== 'No streak yet';
  const parts = isNumeric ? currentLabel.split(' ') : null;
  const countDigit = parts?.[0] ?? '';
  const countUnit = parts ? parts.slice(1).join(' ') : currentLabel;

  return (
    <StatCard title="Streak" accessibilityLabel={`Streak: ${currentLabel}. ${longestLabel}`}>
      <View className="flex-row items-end gap-5">
        {/* Current streak — hero display */}
        <View className="gap-0.5">
          {isNumeric ? (
            <View className="flex-row items-baseline gap-1.5">
              <Text
                className={`font-serif text-5xl leading-none ${countColorClass}`}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                {countDigit}
              </Text>
              <Text className={`font-sans text-base font-medium ${countColorClass}`}>
                {countUnit}
              </Text>
            </View>
          ) : (
            <Text className="font-sans text-base font-medium text-text-muted">
              {currentLabel}
            </Text>
          )}
          <Text className="font-sans text-xs text-text-muted mt-0.5">
            current streak
          </Text>
        </View>

        {/* Thin vertical divider */}
        <View
          className="self-stretch w-px bg-line"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />

        {/* Longest streak */}
        <View className="gap-0.5">
          <Text className="font-sans text-sm font-medium text-text">
            {longestLabel}
          </Text>
          <Text className="font-sans text-xs text-text-muted">
            all time
          </Text>
        </View>
      </View>
    </StatCard>
  );
}
