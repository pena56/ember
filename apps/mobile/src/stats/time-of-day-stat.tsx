/**
 * time-of-day-stat.tsx — 4-part horizontal bar chart (morning/afternoon/
 * evening/night) for the Stats tab.
 *
 * Proportional bars using fraction from presentStats. Track = bg-line,
 * fill = bg-accent. Empty state when hasAny is false.
 * Token-only styling (invariant #6). No SVG needed — pure View layout.
 */

import type { DimensionValue } from 'react-native';
import { Text, View } from 'react-native';

import type { StatsView } from './present-stats.js';
import { StatCard } from './stat-card.js';

// ── Props ─────────────────────────────────────────────────────────────────────

interface TimeOfDayStatProps {
  view: StatsView;
}

// ── Day-part emoji/icon map ────────────────────────────────────────────────────

const PART_LABELS: Record<string, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function TimeOfDayStat({ view }: TimeOfDayStatProps) {
  const { parts, hasAny } = view.timeOfDay;

  return (
    <StatCard title="Time of day">
      {!hasAny ? (
        <Text className="font-sans text-sm text-text-muted">
          Start reading to see your patterns.
        </Text>
      ) : (
        <View className="gap-3">
          {parts.map((part) => (
            <View key={part.part} className="flex-row items-center gap-3">
              {/* Label */}
              <Text
                className="font-sans text-xs text-text-muted"
                style={{ width: 64 }}
                numberOfLines={1}
              >
                {PART_LABELS[part.part] ?? part.part}
              </Text>

              {/* Bar track */}
              <View className="flex-1 h-2 bg-line rounded-full overflow-hidden">
                {/* Fill */}
                <View
                  className="h-2 rounded-full bg-accent"
                  style={{ width: `${(part.fraction * 100).toString()}%` as DimensionValue }}
                />
              </View>

              {/* Duration label */}
              <Text
                className="font-sans text-xs text-text-muted"
                style={{ width: 36, textAlign: 'right' }}
                numberOfLines={1}
              >
                {part.label}
              </Text>
            </View>
          ))}
        </View>
      )}
    </StatCard>
  );
}
