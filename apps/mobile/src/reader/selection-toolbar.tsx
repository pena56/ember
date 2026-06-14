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

import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, View } from 'react-native';

import type { HighlightColor } from '@ember/core';
import { HIGHLIGHT_COLORS } from '@ember/core';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SelectionToolbarProps {
  /** Which colors to show (defaults to all four if omitted). */
  colors?: HighlightColor[];
  /** Called when the user taps a color swatch. */
  onPick: (color: HighlightColor) => void;
  /** Absolute position style passed in by the screen (WebView-viewport → overlay coords). */
  style?: StyleProp<ViewStyle>;
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

// ── Component ─────────────────────────────────────────────────────────────────

export function SelectionToolbar({
  colors = [...HIGHLIGHT_COLORS],
  onPick,
  style,
}: SelectionToolbarProps) {
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
    </View>
  );
}
