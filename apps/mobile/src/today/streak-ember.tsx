/**
 * streak-ember.tsx — the glowing flame motif for the mobile Today habit header.
 *
 * Status-aware: lit (warm streak-lit glow), at-risk (muted amber), broken/zero
 * (dim ash). Freeze pips appear only when freezesBanked > 0. Reuses EmberFlame's
 * path shape for cross-client motif parity.
 *
 * Token-only styling via useResolveClassNames → ColorValue (invariant #6): uniwind
 * resolves only known-compiled classes and react-native-svg takes ColorValue props,
 * so colors are resolved here and passed to <Path>/<Line>, never as classNames.
 * No CSS drop-shadow/blur on RN — the "lit" glow is a faint token-tinted halo View
 * + soft native shadow; shipped static (no motion dep) per spec platform-reality #3.
 */

import type { ColorValue } from 'react-native';
import { View, Text } from 'react-native';
import { Line, Path, Svg } from 'react-native-svg';
import { useResolveClassNames } from 'uniwind';

import type { HabitView } from './present-habit.js';

// ── Props ─────────────────────────────────────────────────────────────────────

interface StreakEmberProps {
  view: HabitView;
}

const FLAME_SIZE = 46;

// ── Snowflake (freeze pip) ────────────────────────────────────────────────────

function SnowflakeIcon({ color }: { color: ColorValue }) {
  return (
    <Svg width={10} height={10} viewBox="0 0 16 16">
      <Line x1={8} y1={1} x2={8} y2={15} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={1} y1={8} x2={15} y2={8} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={3} y1={3} x2={13} y2={13} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={13} y1={3} x2={3} y2={13} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StreakEmber({ view }: StreakEmberProps) {
  const { streakCount, streakStatus, streakLabel, streakSublabel, freezesBanked } = view;

  // Resolve token colors to ColorValue (invariant #6 — never hardcoded, never className on SVG)
  const litColor = useResolveClassNames('bg-streak-lit').backgroundColor as ColorValue;
  const riskColor = useResolveClassNames('bg-streak-risk').backgroundColor as ColorValue;
  const mutedColor = useResolveClassNames('bg-text-muted').backgroundColor as ColorValue;
  const surface = useResolveClassNames('bg-surface-raised').backgroundColor as ColorValue;

  const isLit = streakStatus === 'lit';
  const isAtRisk = streakStatus === 'at-risk';

  // Flame color + opacity by status
  const flameColor = isLit ? litColor : isAtRisk ? riskColor : mutedColor;
  const flameOpacity = isLit ? 1 : isAtRisk ? 0.95 : 0.4;
  // Count text echoes the flame color (lit/at-risk); broken falls back to muted text token
  const countColor = isLit ? litColor : isAtRisk ? riskColor : mutedColor;

  const ariaLabel =
    streakCount > 0
      ? `${streakCount} ${streakCount === 1 ? 'day' : 'days'} reading streak, ${streakSublabel.toLowerCase()}`
      : `Start your streak — ${streakSublabel.toLowerCase()}`;

  return (
    <View className="flex-row items-start gap-3" accessibilityRole="image" accessibilityLabel={ariaLabel}>
      {/* Flame + glow */}
      <View
        className="items-center justify-center"
        style={{ width: FLAME_SIZE, height: FLAME_SIZE }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {/* Soft token-tinted halo — RN-native glow, only when lit (no CSS blur) */}
        {isLit && (
          <View
            style={{
              position: 'absolute',
              width: FLAME_SIZE * 0.92,
              height: FLAME_SIZE * 0.92,
              borderRadius: FLAME_SIZE,
              backgroundColor: litColor,
              opacity: 0.16,
              // subtle native lift for warmth (iOS shadow / Android elevation)
              shadowColor: litColor,
              shadowOpacity: 0.6,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 0 },
              elevation: 4,
            }}
          />
        )}

        {/* Flame — EmberFlame path shape for motif parity */}
        <Svg width={FLAME_SIZE} height={FLAME_SIZE} viewBox="0 0 56 56" fill="none">
          <Path
            d="M28 10C28 10 18 22 18 32C18 37.523 22.477 42 28 42C33.523 42 38 37.523 38 32C38 26 34 20 32 16C32 16 31 24 28 26C25 24 28 10 28 10Z"
            fill={flameColor}
            fillOpacity={flameOpacity}
          />
          <Path
            d="M28 26C28 26 23 31 23 35C23 37.761 25.239 40 28 40C30.761 40 33 37.761 33 35C33 31 28 26 28 26Z"
            fill={surface}
            fillOpacity={isLit ? 0.9 : 0.6}
          />
        </Svg>
      </View>

      {/* Text stack */}
      <View className="flex-1 min-w-0 gap-0.5 pt-0.5">
        {streakCount > 0 && (
          <Text
            className="font-serif text-3xl leading-none"
            style={{ color: countColor }}
          >
            {streakCount}
          </Text>
        )}

        <Text
          className={`font-sans text-sm font-medium leading-snug ${
            streakCount > 0 ? 'text-text' : 'text-text-muted'
          }`}
        >
          {streakLabel}
        </Text>

        <Text className="font-sans text-xs text-text-muted leading-snug">
          {streakSublabel}
        </Text>

        {/* Freeze pips — only when banked > 0 */}
        {freezesBanked > 0 && (
          <View className="flex-row items-center self-start mt-1.5 rounded-full bg-line px-2 py-0.5 gap-1">
            <SnowflakeIcon color={mutedColor} />
            <Text className="font-sans text-xs font-medium text-text-muted">
              {freezesBanked}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
