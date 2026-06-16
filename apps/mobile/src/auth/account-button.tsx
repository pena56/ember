/**
 * account-button.tsx — person-icon button for the Library header.
 *
 * Reads useAccount():
 *   anonymous → outline person icon (accessibilityLabel "Save your library")
 *   claimed   → filled/checked person icon ("Account")
 *   loading   → neutral (same icon, muted)
 *
 * Token-colored via useResolveClassNames (invariant #6 — no hardcoded colors).
 * onPress → router.push('/account').
 */

import { router } from 'expo-router';
import type { ColorValue } from 'react-native';
import { Pressable } from 'react-native';
import { Circle, Path, Svg } from 'react-native-svg';
import { useResolveClassNames } from 'uniwind';

import { useAccount } from './use-account.js';

// ── Person icon shapes ────────────────────────────────────────────────────────

interface PersonIconProps {
  size?: number;
  color: ColorValue;
  /** Show the filled/claimed variant (head + body filled). */
  filled?: boolean;
}

function PersonIcon({ size = 22, color, filled = false }: PersonIconProps) {
  if (filled) {
    return (
      <Svg width={size} height={size} viewBox="0 0 22 22" fill="none">
        {/* Head */}
        <Circle cx={11} cy={7} r={4} fill={color} />
        {/* Body */}
        <Path
          d="M3 19c0-4.418 3.582-8 8-8s8 3.582 8 8"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          fill={color}
          fillOpacity={0.18}
        />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 22 22" fill="none">
      {/* Head (outline) */}
      <Circle cx={11} cy={7} r={3.5} stroke={color} strokeWidth={1.5} />
      {/* Body (outline) */}
      <Path
        d="M3 19c0-4.418 3.582-8 8-8s8 3.582 8 8"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ── Account button ────────────────────────────────────────────────────────────

export function AccountButton() {
  const { status } = useAccount();

  const accentColor = useResolveClassNames('bg-accent').backgroundColor as ColorValue;
  const mutedColor = useResolveClassNames('bg-text-muted').backgroundColor as ColorValue;

  const isClaimed = status === 'claimed';
  const isLoading = status === 'loading';

  const color = isLoading ? mutedColor : accentColor;
  const label = isClaimed ? 'Account' : 'Save your library';

  return (
    <Pressable
      onPress={() => { router.push('/account'); }}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <PersonIcon color={color} filled={isClaimed} />
    </Pressable>
  );
}
