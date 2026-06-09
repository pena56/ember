import type { ColorValue } from 'react-native';
import { Circle, Path, Svg } from 'react-native-svg';
import { useResolveClassNames } from 'uniwind';

// ── Types ─────────────────────────────────────────────────────────────────────

interface EmberFlameProps {
  /** Square size in px. */
  size?: number;
}

/**
 * The brand ember/flame motif — a ringed flame, matching the web Library's
 * empty-state mark for cross-client consistency (ui-context.md "ember" motif).
 *
 * Token-driven (invariant #6): colors are resolved through uniwind from the
 * shared tokens via classes that are known-compiled (`border-line`/`bg-accent`/
 * `bg-surface`), so the mark re-themes with light/dark like everything else.
 */
export function EmberFlame({ size = 56 }: EmberFlameProps) {
  const ring = useResolveClassNames('border-line').borderColor as ColorValue;
  const flame = useResolveClassNames('bg-accent').backgroundColor as ColorValue;
  const cutout = useResolveClassNames('bg-surface').backgroundColor as ColorValue;

  return (
    <Svg width={size} height={size} viewBox="0 0 56 56" fill="none">
      <Circle cx={28} cy={28} r={27} stroke={ring} strokeWidth={1.5} />
      <Path
        d="M28 10C28 10 18 22 18 32C18 37.523 22.477 42 28 42C33.523 42 38 37.523 38 32C38 26 34 20 32 16C32 16 31 24 28 26C25 24 28 10 28 10Z"
        fill={flame}
        fillOpacity={0.6}
      />
      <Path
        d="M28 26C28 26 23 31 23 35C23 37.761 25.239 40 28 40C30.761 40 33 37.761 33 35C33 31 28 26 28 26Z"
        fill={cutout}
      />
    </Svg>
  );
}
