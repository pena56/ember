/**
 * continue-reading-card.tsx — the mobile Continue Reading card.
 *
 * Has-item: ember-motif label + cleaned book title (Fraunces) + Page {n} line +
 * a Resume button with a play glyph. Empty: gentle nudge + Browse library.
 * Token-driven, bespoke uniwind — NO hardcoded colors (invariant #6).
 * Side-stripe accent is banned; the ember motif is carried via a dimmed EmberFlame.
 */

import type { ColorValue } from 'react-native';
import { Pressable, Text, View } from 'react-native';
import { Path, Svg } from 'react-native-svg';
import { useResolveClassNames } from 'uniwind';

import { EmberFlame } from '../library/ember-flame.js';

import { formatBookTitle } from './format-title.js';
import type { ContinueReadingItem } from './select-continue-reading.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ContinueReadingCardProps {
  item: ContinueReadingItem | undefined;
  onResume: (docId: string) => void;
  onBrowseLibrary: () => void;
}

// ── Play glyph (on-accent, for the Resume button) ──────────────────────────────

function PlayGlyph({ color }: { color: ColorValue }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 12 12" accessibilityElementsHidden>
      <Path d="M2.75 1.6 10.2 6 2.75 10.4Z" fill={color} />
    </Svg>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

export function ContinueReadingCard({ item, onResume, onBrowseLibrary }: ContinueReadingCardProps) {
  // on-accent token (dark ink on the ember CTA) for the play glyph (invariant #6).
  const onAccent = useResolveClassNames('bg-on-accent').backgroundColor as ColorValue;

  if (item) {
    const title = formatBookTitle(item.title);
    return (
      <View className="bg-surface-raised border border-line rounded-2xl p-6 gap-5">
        {/* Ember motif header — dim flame + label */}
        <View className="flex-row items-center gap-2.5">
          <View
            className="opacity-50"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <EmberFlame size={18} />
          </View>
          <Text className="font-sans text-xs font-semibold uppercase tracking-widest text-text-muted">
            Continue reading
          </Text>
        </View>

        {/* Title + page */}
        <View className="gap-2">
          <Text
            className="font-serif text-2xl text-text leading-tight"
            numberOfLines={3}
            accessibilityRole="text"
          >
            {title}
          </Text>
          <Text className="font-sans text-sm text-text-muted">
            Page {item.page}
          </Text>
        </View>

        {/* Resume button */}
        <Pressable
          onPress={() => { onResume(item.docId); }}
          accessibilityRole="button"
          accessibilityLabel={`Resume reading ${title}`}
          className="mt-1"
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
        >
          <View className="bg-accent rounded-xl px-5 py-3.5 flex-row items-center justify-center gap-2">
            <PlayGlyph color={onAccent} />
            <Text className="font-sans font-semibold text-sm text-on-accent">
              Resume
            </Text>
          </View>
        </Pressable>
      </View>
    );
  }

  // Empty state — gentle nudge
  return (
    <View
      className="bg-surface-raised border border-line rounded-2xl px-6 py-10 items-center gap-5"
      accessibilityRole="none"
    >
      {/* Ember motif — dimmed, contextual */}
      <View
        className="opacity-50"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <EmberFlame size={52} />
      </View>

      <View className="items-center gap-2 px-2">
        <Text className="font-serif text-xl text-text text-center leading-snug">
          Your next chapter awaits.
        </Text>
        <Text className="font-sans text-sm text-text-muted text-center leading-relaxed">
          Nothing open yet — pick a book from your library to begin.
        </Text>
      </View>

      <Pressable
        onPress={onBrowseLibrary}
        accessibilityRole="button"
        accessibilityLabel="Browse your library"
        className="mt-1"
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
      >
        <View className="border border-line rounded-xl px-5 py-3 flex-row items-center justify-center">
          <Text className="font-sans text-sm font-medium text-text">
            Browse library
          </Text>
        </View>
      </Pressable>
    </View>
  );
}
