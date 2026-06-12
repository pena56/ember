/**
 * app/(tabs)/_layout.tsx — bottom tab bar shell.
 *
 * Two tabs: Today (index) + Library (library). Reader stays outside the tabs as
 * a full-screen Stack route (reader/[id]).
 *
 * Token-driven tab bar (invariant #6): colors resolved via useResolveClassNames
 * so the tab bar re-themes live with light/dark. Icons: inline SVG via
 * react-native-svg (already a dep — no new package needed).
 */

import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { Path, Svg } from 'react-native-svg';
import { useResolveClassNames } from 'uniwind';

// ── Tab icons (bespoke inline SVG — token color injected at render) ───────────

function SunIcon({ color, size }: { color: ColorValue; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Sun circle */}
      <Path
        d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
      {/* Rays */}
      <Path
        d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function LibraryIcon({ color, size }: { color: ColorValue; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Three stacked book spines */}
      <Path
        d="M4 19V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v14"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M9 19V9a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v10"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M14.5 19V13l3.5-2v8"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Base line */}
      <Path
        d="M3 19h18"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default function TabsLayout() {
  // Resolve semantic tokens through the active theme (invariant #6).
  // Cast via `unknown` to string — useResolveClassNames returns the resolved
  // hex string at runtime; the ColorValue type is overly broad for TS but the
  // value is always a plain string in the uniwind resolver.
  const accent    = useResolveClassNames('bg-accent').backgroundColor as unknown as string;
  const textMuted = useResolveClassNames('text-text-muted').color as unknown as string;
  const surface   = useResolveClassNames('bg-surface').backgroundColor as unknown as string;
  const line      = useResolveClassNames('border-line').borderColor as unknown as string;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: accent,
        tabBarInactiveTintColor: textMuted,
        tabBarStyle: {
          backgroundColor: surface,
          borderTopColor: line,
          borderTopWidth: 1,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, size }) => <SunIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Library',
          tabBarIcon: ({ color, size }) => <LibraryIcon color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
