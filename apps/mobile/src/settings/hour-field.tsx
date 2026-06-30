/**
 * hour-field.tsx — bespoke token-only hour stepper for the quiet-hours picker.
 *
 * Renders a single whole-hour value (0–24) as a labelled stepper row with
 * − / + buttons. Emits the incremented/decremented integer value; the caller
 * owns the pair and calls onChangeQuietHours with both ends each time.
 *
 * Design constraints:
 *  - No native DateTimePicker — bespoke, zero new deps (spec §Dependencies).
 *  - Token-only styling — no hardcoded colours (invariant #6).
 *  - Re-themes with light/dark automatically via semantic token classes.
 *  - Full a11y: accessibilityRole="adjustable" + accessibilityValue +
 *    accessibilityActions increment/decrement + disabled state.
 */

import { useCallback } from 'react';
import type { AccessibilityActionEvent } from 'react-native';
import { Pressable, Text, View } from 'react-native';

// ── Hour formatter ────────────────────────────────────────────────────────────
// Lives in a pure (no-RN) module so vitest can test it without React Native.
// Re-exported here so callers can import it from the same entry point.

import { formatHour } from './format-hour.js';
export { formatHour };

// ── Props ─────────────────────────────────────────────────────────────────────

export interface HourFieldProps {
  /** Short label shown to the left of the stepper (e.g. "From", "To"). */
  label: string;
  /** Current hour value: whole integer in [0, 24]. */
  hour: number;
  /** Called with the new integer value when the user increments or decrements. */
  onChange: (hour: number) => void;
  /** When true, stepper is visually dimmed and non-interactive. */
  disabled?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function HourField({ label, hour, onChange, disabled = false }: HourFieldProps) {
  const decrement = useCallback(() => {
    if (disabled) return;
    onChange(Math.max(0, hour - 1));
  }, [disabled, hour, onChange]);

  const increment = useCallback(() => {
    if (disabled) return;
    onChange(Math.min(24, hour + 1));
  }, [disabled, hour, onChange]);

  // Accessibility: the whole group is one "adjustable" element so screen readers
  // can swipe up/down to step through hours without exposing the internal buttons.
  const handleA11yAction = useCallback(
    (event: AccessibilityActionEvent) => {
      const { actionName } = event.nativeEvent;
      if (actionName === 'increment') increment();
      else if (actionName === 'decrement') decrement();
    },
    [increment, decrement],
  );

  const formatted = formatHour(hour);

  return (
    // Outer wrapper: carries the a11y role for the whole stepper unit.
    // The opacity + pointer-events are also controlled at the parent section
    // level; disabled is still forwarded here so a11y state is accurate even
    // if this component is used standalone.
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: formatted }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={handleA11yAction}
      accessibilityState={{ disabled }}
      // No self-dim here: in Settings the parent gated section already applies
      // a single uniform opacity over the whole subtree, so dimming again would
      // double up (toggles at 0.45, fields at ~0.22). The disabled state still
      // disables the buttons (and hides them from touch) for direct/standalone tap.
    >
      {/* Label */}
      <Text className="font-sans text-xs font-medium uppercase tracking-widest text-text-muted mb-2">
        {label}
      </Text>

      {/* Stepper: [ − ]  8:00 AM  [ + ] */}
      <View className="flex-row items-center gap-3">
        {/* Decrement button */}
        <Pressable
          onPress={decrement}
          disabled={disabled || hour <= 0}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className={
            disabled || hour <= 0
              ? 'w-9 h-9 rounded-full border border-line bg-surface items-center justify-center opacity-40'
              : 'w-9 h-9 rounded-full border border-line bg-surface items-center justify-center'
          }
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
        >
          <Text className="font-sans text-base font-medium text-text-muted" style={{ lineHeight: 18 }}>
            −
          </Text>
        </Pressable>

        {/* Current value display — serif for the warm Ember feel */}
        <Text
          className="font-serif text-base text-text"
          style={{ minWidth: 76, textAlign: 'center' }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {formatted}
        </Text>

        {/* Increment button */}
        <Pressable
          onPress={increment}
          disabled={disabled || hour >= 24}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className={
            disabled || hour >= 24
              ? 'w-9 h-9 rounded-full border border-line bg-surface items-center justify-center opacity-40'
              : 'w-9 h-9 rounded-full border border-line bg-surface items-center justify-center'
          }
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
        >
          <Text className="font-sans text-base font-medium text-text-muted" style={{ lineHeight: 18 }}>
            +
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
