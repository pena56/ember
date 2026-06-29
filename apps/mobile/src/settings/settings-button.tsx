/**
 * settings-button.tsx — gear-icon button for the Today header.
 *
 * Mirrors account-button.tsx: token-colored SVG via useResolveClassNames
 * (invariant #6 — no hardcoded colors), accessibilityRole="button", label
 * "Settings", onPress → router.push('/settings').
 */

import { router } from 'expo-router';
import type { ColorValue } from 'react-native';
import { Pressable } from 'react-native';
import { Circle, Path, Svg } from 'react-native-svg';
import { useResolveClassNames } from 'uniwind';

// ── Gear icon ─────────────────────────────────────────────────────────────────

interface GearIconProps {
  size?: number;
  color: ColorValue;
}

function GearIcon({ size = 22, color }: GearIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22" fill="none">
      {/* Cog teeth + body */}
      <Path
        d="M11 2.5l1.3.4.5 1.7a6.5 6.5 0 011.6.94l1.74-.4 1.1.84-.5 1.7c.2.5.36 1.03.46 1.58l1.5.95v1.38l-1.5.95c-.1.55-.26 1.08-.46 1.58l.5 1.7-1.1.84-1.74-.4a6.5 6.5 0 01-1.6.94l-.5 1.7-1.3.4-1.3-.4-.5-1.7a6.5 6.5 0 01-1.6-.94l-1.74.4-1.1-.84.5-1.7a6.4 6.4 0 01-.46-1.58l-1.5-.95v-1.38l1.5-.95c.1-.55.26-1.08.46-1.58l-.5-1.7 1.1-.84 1.74.4a6.5 6.5 0 011.6-.94l.5-1.7L11 2.5z"
        stroke={color}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      {/* Center hub */}
      <Circle cx={11} cy={11} r={2.6} stroke={color} strokeWidth={1.4} />
    </Svg>
  );
}

// ── Settings button ────────────────────────────────────────────────────────────

export function SettingsButton() {
  const accentColor = useResolveClassNames('bg-accent').backgroundColor as ColorValue;

  return (
    <Pressable
      onPress={() => { router.push('/settings'); }}
      accessibilityRole="button"
      accessibilityLabel="Settings"
      hitSlop={{ top: 11, bottom: 11, left: 11, right: 11 }}
    >
      <GearIcon color={accentColor} />
    </Pressable>
  );
}
