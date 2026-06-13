/**
 * totals-stat.tsx — reading totals (active time, pages, days, sessions) +
 * reading speed for the Stats tab.
 *
 * 2×2 grid of Fraunces numerals + Inter labels, with reading speed as a
 * fifth figure spanning below. Quiet, factual, no decoration.
 * Token-only styling (invariant #6).
 */

import { Text, View } from 'react-native';

import type { StatsView } from './present-stats.js';
import { StatCard } from './stat-card.js';

// ── Props ─────────────────────────────────────────────────────────────────────

interface TotalsStatProps {
  view: StatsView;
}

// ── Sub-component: single stat cell ───────────────────────────────────────────

interface StatCellProps {
  value: string;
  label: string;
}

function StatCell({ value, label }: StatCellProps) {
  return (
    <View className="flex-1 gap-0.5">
      <Text
        className="font-serif text-2xl text-text leading-none"
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {value}
      </Text>
      <Text className="font-sans text-xs text-text-muted">
        {label}
      </Text>
    </View>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TotalsStat({ view }: TotalsStatProps) {
  const { totals, speed } = view;

  return (
    <StatCard title="Reading">
      {/* 2×2 grid */}
      <View className="gap-4">
        <View className="flex-row gap-4">
          <StatCell value={totals.activeLabel} label="active time" />
          <StatCell value={totals.pagesLabel.split(' ')[0] ?? totals.pagesLabel} label="pages turned" />
        </View>
        <View className="h-px bg-line" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        <View className="flex-row gap-4">
          <StatCell value={totals.daysReadLabel.split(' ')[0] ?? totals.daysReadLabel} label="days read" />
          <StatCell value={totals.sessionsLabel.split(' ')[0] ?? totals.sessionsLabel} label="sessions" />
        </View>
        <View className="h-px bg-line" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        {/* Reading speed — full width */}
        <View className="flex-row items-baseline gap-1.5">
          <Text
            className="font-serif text-2xl text-text leading-none"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {speed.pagesPerHourLabel}
          </Text>
          {speed.pagesPerHourLabel !== '—' && (
            <Text className="font-sans text-xs text-text-muted">
              reading speed
            </Text>
          )}
          {speed.pagesPerHourLabel === '—' && (
            <Text className="font-sans text-xs text-text-muted">
              reading speed not yet calculated
            </Text>
          )}
        </View>
      </View>
    </StatCard>
  );
}
