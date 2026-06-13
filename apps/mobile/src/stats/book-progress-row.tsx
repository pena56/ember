/**
 * book-progress-row.tsx — one row in the per-book progress list (Stats tab).
 *
 * Title (Inter), a thin progress bar (progressRatio; quiet empty track when null),
 * subtitle line: "64% · ~2h left" / "100% · Finished" / title-only when both null.
 * Finished books read in the muted tone (bg-text-muted fill); in-progress use accent.
 * Token-only styling (invariant #6).
 */

import type { DimensionValue } from 'react-native';
import { Text, View } from 'react-native';

// ── Props ─────────────────────────────────────────────────────────────────────

interface BookProgressRowProps {
  title: string;
  progressLabel: string | null;
  etaLabel: string | null;
  progressRatio: number | null;
  /** Last row drops its trailing hairline (no last:border-b-0 in RN). */
  isLast?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BookProgressRow({
  title,
  progressLabel,
  etaLabel,
  progressRatio,
  isLast = false,
}: BookProgressRowProps) {
  const isFinished = etaLabel === 'Finished';

  // Build subtitle: "64% · ~2h left" / "100% · Finished" / single label / none.
  let subtitle: string | null = null;
  if (progressLabel !== null && etaLabel !== null) {
    subtitle = `${progressLabel} · ${etaLabel}`;
  } else if (progressLabel !== null) {
    subtitle = progressLabel;
  } else if (etaLabel !== null) {
    subtitle = etaLabel;
  }

  const isIndeterminate = progressRatio === null;
  const barWidth = progressRatio !== null ? `${(progressRatio * 100).toFixed(1)}%` : '0%';

  const a11yLabel = subtitle !== null ? `${title}: ${subtitle}` : title;

  return (
    <View
      className={`py-3 ${isLast ? '' : 'border-b border-line'}`}
      accessibilityLabel={a11yLabel}
    >
      {/* Title + subtitle row */}
      <View className="flex-row items-start justify-between gap-3 mb-1.5">
        <Text
          className={`font-sans text-sm font-medium leading-snug flex-1 ${
            isFinished ? 'text-text-muted' : 'text-text'
          }`}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle !== null && (
          <Text
            className="font-sans text-xs text-text-muted"
            style={{ fontVariant: ['tabular-nums'] }}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        )}
      </View>

      {/* Progress bar track */}
      <View className="h-1 w-full bg-line rounded-full overflow-hidden">
        {!isIndeterminate && (
          <View
            className={`h-1 rounded-full ${isFinished ? 'bg-text-muted' : 'bg-accent'}`}
            style={{ width: barWidth as DimensionValue }}
          />
        )}
      </View>
    </View>
  );
}
