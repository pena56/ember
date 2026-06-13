/**
 * goal-ring.tsx — circular progress ring showing today's active minutes vs target.
 *
 * Two concentric react-native-svg circles: track (line token) + progress arc
 * (accent token). ringFraction is pre-clamped to [0,1] by presentHabit — no
 * clamping here. Same geometry as the web 08b ring (RADIUS 40, STROKE 8, viewBox 100).
 *
 * Token-only styling via useResolveClassNames → ColorValue (invariant #6).
 * accessibilityRole="image" + label for a11y; arc shipped static (no motion dep).
 */

import type { ColorValue } from 'react-native';
import { View, Text } from 'react-native';
import { Circle, Svg } from 'react-native-svg';
import { useResolveClassNames } from 'uniwind';

import type { HabitView } from './present-habit.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const RADIUS = 40;
const STROKE_WIDTH = 8;
const VIEWBOX = 100;        // viewBox units
const RENDER_SIZE = 88;     // rendered px — fits the narrow phone column
const CIRCUMFERENCE = 2 * Math.PI * RADIUS; // ≈ 251.327
const CENTER = VIEWBOX / 2;

// ── Props ─────────────────────────────────────────────────────────────────────

interface GoalRingProps {
  view: HabitView;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GoalRing({ view }: GoalRingProps) {
  const { ringFraction, goalLabel, goalMet, goalMinutes, targetMinutes } = view;

  // Resolve token colors (invariant #6)
  const track = useResolveClassNames('bg-line').backgroundColor as ColorValue;
  const arc = useResolveClassNames('bg-accent').backgroundColor as ColorValue;

  const dashOffset = CIRCUMFERENCE * (1 - ringFraction);

  const ariaLabel = goalMet
    ? `Today's goal met: ${goalMinutes} of ${targetMinutes} minutes`
    : `Today's goal: ${goalMinutes} of ${targetMinutes} minutes`;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={ariaLabel}
      className="items-center justify-center"
      style={{ width: RENDER_SIZE, height: RENDER_SIZE }}
    >
      {/* SVG ring — absolute fill */}
      <Svg
        width={RENDER_SIZE}
        height={RENDER_SIZE}
        viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        style={{ position: 'absolute' }}
      >
        {/* Track */}
        <Circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke={track}
          strokeWidth={STROKE_WIDTH}
        />
        {/* Progress arc — starts at top via rotation */}
        <Circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke={arc}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          rotation={-90}
          originX={CENTER}
          originY={CENTER}
        />
      </Svg>

      {/* Center text overlay */}
      <View
        className="items-center justify-center gap-0.5"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text
          className="font-sans text-text"
          style={{ fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] }}
        >
          {goalLabel}
        </Text>
        {goalMet && (
          <Text
            className="font-sans text-accent uppercase tracking-wide"
            style={{ fontSize: 9, fontWeight: '500', marginTop: 1 }}
          >
            Goal met
          </Text>
        )}
      </View>
    </View>
  );
}
