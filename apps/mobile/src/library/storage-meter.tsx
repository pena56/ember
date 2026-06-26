/**
 * storage-meter.tsx — quota usage progress bar for the library screen (RN port).
 *
 * Reads useStorageUsage() and renders a labelled progress bar showing how much
 * of the quota is used. Token-only — no hardcoded colors (invariant #6).
 * A11y: accessibilityRole="progressbar" + accessibilityValue.
 *
 * Behaviour:
 *  - Hidden (returns null) while usage is undefined (loading / unauthenticated).
 *  - Calm treatment below 80% quota (accent track).
 *  - Warm near-limit treatment (streak-lit token) at or above 80% quota.
 */

import type { DimensionValue } from 'react-native';
import { View, Text } from 'react-native';

import { formatBytes } from '../store/format-bytes.js';
import { useStorageUsage } from '../sync/use-storage-usage.js';

/** 80% threshold for near-limit amber treatment. */
const NEAR_LIMIT_RATIO = 0.8;

export function StorageMeter() {
  const usage = useStorageUsage();

  if (usage === undefined) return null;

  const { used, quota } = usage;
  const ratio = quota > 0 ? Math.min(used / quota, 1) : 0;
  const pct = Math.round(ratio * 100);
  const isNearLimit = ratio >= NEAR_LIMIT_RATIO;

  return (
    <View className="gap-1">
      {/* Label row */}
      <View className="flex-row justify-between items-baseline">
        <Text className="font-sans text-xs text-text-muted">Storage</Text>
        <Text
          className={isNearLimit ? 'font-sans text-xs text-streak-lit' : 'font-sans text-xs text-text-muted'}
        >
          {formatBytes(used)} of {formatBytes(quota)} used
        </Text>
      </View>

      {/* Progress track */}
      <View
        className="w-full h-1.5 rounded-full bg-line overflow-hidden"
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: quota, now: used }}
        accessibilityLabel={`${pct.toString()}% of storage used`}
      >
        {/* Filled portion */}
        <View
          className={isNearLimit ? 'h-full rounded-full bg-streak-lit' : 'h-full rounded-full bg-accent'}
          style={{ width: `${pct.toString()}%` as DimensionValue }}
        />
      </View>
    </View>
  );
}
