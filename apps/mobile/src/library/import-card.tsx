import { Pressable, Text, View } from 'react-native';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ImportCardProps {
  onPickPdf(): void;
  disabled?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Dashed surface-raised card with an "Add PDF" accent button.
 * Token-driven: no hardcoded colors or spacing (invariant #6).
 */
export function ImportCard({ onPickPdf, disabled = false }: ImportCardProps) {
  return (
    <View className="rounded-xl border border-dashed border-line bg-surface-raised p-6 items-center gap-4">
      <View className="items-center gap-2">
        <Text className="font-serif text-xl text-text">
          Your reading nook awaits
        </Text>
        <Text className="font-sans text-sm text-text-muted text-center">
          Choose a PDF from your files and it joins your collection.
        </Text>
      </View>

      <Pressable
        onPress={onPickPdf}
        disabled={disabled}
        className="rounded-lg bg-accent px-6 py-3"
        style={({ pressed }) => ({ opacity: disabled ? 0.5 : pressed ? 0.85 : 1 })}
        accessibilityRole="button"
        accessibilityLabel="Add PDF"
        accessibilityState={{ disabled }}
      >
        <Text className="font-sans text-sm font-medium text-on-accent">
          Add PDF
        </Text>
      </Pressable>
    </View>
  );
}
