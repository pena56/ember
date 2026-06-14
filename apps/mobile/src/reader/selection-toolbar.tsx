/**
 * selection-toolbar.tsx — native floating swatch toolbar for highlight creation.
 *
 * A row of 4 round color swatches (yellow / green / blue / pink) on a
 * `bg-surface-raised` rounded card with `border-line` border + drop shadow.
 * Appears over the selected text; tapping a swatch creates a highlight and
 * dismisses the selection.
 *
 * All colors come from tokens (invariant #6). Literal class names per color so
 * Tailwind's content scan emits them without needing an @source inline() entry.
 */

import type { ColorValue, StyleProp, ViewStyle } from 'react-native';
import { Pressable, View } from 'react-native';
import { Path, Svg } from 'react-native-svg';
import { useResolveClassNames } from 'uniwind';

import type { HighlightColor } from '@ember/core';
import { HIGHLIGHT_COLORS } from '@ember/core';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SelectionToolbarProps {
  /** Which colors to show (defaults to all four if omitted). */
  colors?: HighlightColor[];
  /** Called when the user taps a color swatch. */
  onPick: (color: HighlightColor) => void;
  /** Called when the user taps the Note button (after the swatches). */
  onAddNote: () => void;
  /** Absolute position style passed in by the screen (WebView-viewport → overlay coords). */
  style?: StyleProp<ViewStyle>;
}

// ── Note glyph (token-driven accent ink — invariant #6) ──────────────────────

function NoteGlyph({ color }: { color: ColorValue }) {
  // A small dog-eared note sheet with two text rules.
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8l-5-5Z"
        stroke={color}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
      <Path d="M14 3v5h5" stroke={color} strokeWidth={1.7} strokeLinejoin="round" />
      <Path d="M8.5 13h7M8.5 16.5h5" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}

// ── Per-color literal class names (safelist: Tailwind content scan emits these) ──

const SWATCH_CLASS: Record<HighlightColor, string> = {
  yellow: 'bg-highlight-yellow',
  green:  'bg-highlight-green',
  blue:   'bg-highlight-blue',
  pink:   'bg-highlight-pink',
};

const COLOR_LABEL: Record<HighlightColor, string> = {
  yellow: 'Highlight yellow',
  green:  'Highlight green',
  blue:   'Highlight blue',
  pink:   'Highlight pink',
};

/**
 * Apply an alpha to a resolved token color. Tokens resolve to `#rrggbb`; we append
 * the alpha as a 2-digit hex suffix (#rrggbbaa). Falls back to the raw value when the
 * shape is unexpected so the chip still renders. Keeps colors token-derived (invariant #6).
 */
function withAlpha(color: ColorValue, alpha: number): string {
  const hex = typeof color === 'string' ? color : '';
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
      .toString(16)
      .padStart(2, '0');
    return hex + a;
  }
  return hex;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SelectionToolbar({
  colors = [...HIGHLIGHT_COLORS],
  onPick,
  onAddNote,
  style,
}: SelectionToolbarProps) {
  const accent = useResolveClassNames('bg-accent').backgroundColor as ColorValue;
  const divider = useResolveClassNames('border-line').borderColor as ColorValue;

  return (
    <View
      // Elevation / shadow for visual lift above WebView content.
      // Shadow is decorative; not exposed to accessibility.
      style={[
        style as ViewStyle,
        { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 6 },
      ]}
      className="flex-row items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-raised border border-line"
    >
      {colors.map((color) => (
        <Pressable
          key={color}
          onPress={() => { onPick(color); }}
          className={`w-9 h-9 rounded-full ${SWATCH_CLASS[color]}`}
          accessibilityRole="button"
          accessibilityLabel={COLOR_LABEL[color]}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        />
      ))}

      {/* Divider before the Note action so it reads as distinct from the swatches. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ width: 1, height: 22, backgroundColor: divider as string }}
      />

      {/* Note button — accent-inked glyph in a soft accent-tinted chip, ≥36px target. */}
      <Pressable
        onPress={onAddNote}
        className="w-9 h-9 rounded-lg items-center justify-center"
        accessibilityRole="button"
        accessibilityLabel="Add note"
        // Soft accent wash behind the glyph so the Note action reads as a distinct
        // affordance from the round swatches (resolved token + low alpha, invariant #6).
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, backgroundColor: withAlpha(accent, 0.12) })}
      >
        <NoteGlyph color={accent} />
      </Pressable>
    </View>
  );
}
