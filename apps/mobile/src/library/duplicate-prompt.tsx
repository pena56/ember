/**
 * duplicate-prompt.tsx — inline card surfacing a near-duplicate pair (14c).
 *
 * Pure presentational RN component — no store access. All logic lives in
 * useDuplicates(). Rendered in the Library FlatList ListHeaderComponent
 * (below ImportCard, above StorageMeter) when `pair` is defined.
 *
 * Design: soft bg-surface-raised card with border-line hairline, font-serif
 * title, side-by-side copy metadata, Merge accent Pressable (bg-accent +
 * text-on-accent — invariant #6: never white-on-amber), keep-which radio
 * group (mirrors ThemeControl a11y pattern), Keep both ghost Pressable,
 * Not now quiet text Pressable. No native Alert (merge is reversible).
 *
 * Invariant #6: token-only uniwind classes, no hardcoded palette, re-themes
 * light/dark through the existing useTheme wiring.
 */

import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { Document, DuplicatePair } from '@ember/core';

import { formatBytes } from '../store/format-bytes.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DuplicatePromptProps {
  pair: DuplicatePair;
  docs: { a: Document; b: Document };
  defaultCanonicalId: string;
  onMerge(canonicalId: string): void;
  onKeepSeparate(): void;
  onDismiss(): void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(epochMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(epochMs));
}

// ── Copy card for one document in the pair ────────────────────────────────────

interface CopyCardProps {
  doc: Document;
  label: string;
  selected: boolean;
  onSelect(): void;
}

function CopyCard({ doc, label, selected, onSelect }: CopyCardProps) {
  return (
    <Pressable
      onPress={onSelect}
      // ≥44pt hit target (spec §A11y)
      className={
        selected
          ? 'min-h-[44px] flex-1 rounded-lg border border-accent bg-surface p-4 gap-2'
          : 'min-h-[44px] flex-1 rounded-lg border border-line bg-surface p-4 gap-2'
      }
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`Keep ${label}: ${doc.title}`}
    >
      {/* Selected indicator row */}
      <View className="flex-row items-center gap-2">
        {/* Radio circle — token-only (invariant #6) */}
        <View
          className={
            selected
              ? 'w-4 h-4 rounded-full border-2 border-accent bg-accent'
              : 'w-4 h-4 rounded-full border-2 border-line bg-surface'
          }
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <Text
          className={
            selected
              ? 'font-sans text-xs font-medium text-accent uppercase'
              : 'font-sans text-xs font-medium text-text-muted uppercase'
          }
        >
          {selected ? 'Keep this one' : label}
        </Text>
      </View>

      {/* Book title */}
      <Text
        className="font-serif text-sm font-medium text-text leading-snug"
        numberOfLines={2}
        ellipsizeMode="tail"
      >
        {doc.title}
      </Text>

      {/* Filename */}
      <Text
        className="font-sans text-xs text-text-muted"
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {doc.filename}
      </Text>

      {/* Size · date */}
      <Text className="font-sans text-xs text-text-muted">
        {formatBytes(doc.byteSize)}
        {'  ·  '}
        {'Added '}
        {formatDate(doc.importedAt)}
      </Text>
    </Pressable>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * DuplicatePrompt — inline surface-raised card.
 *
 * Local useState for selected canonical, seeded from defaultCanonicalId.
 * Three action paths: Merge (accent CTA), Keep both (ghost), Not now (quiet).
 */
export function DuplicatePrompt({
  docs,
  defaultCanonicalId,
  onMerge,
  onKeepSeparate,
  onDismiss,
}: DuplicatePromptProps) {
  const [selectedCanonicalId, setSelectedCanonicalId] = useState(defaultCanonicalId);

  return (
    <View
      className="rounded-xl border border-line bg-surface-raised p-5 gap-4"
      accessibilityLabel="Possible duplicate book"
    >
      {/* Title — font-serif, warm framing, not alarming */}
      <Text className="font-serif text-lg font-semibold text-text leading-snug">
        This looks like a book you already have
      </Text>

      {/* Body — font-sans, text-text-muted, calm */}
      <Text className="font-sans text-sm text-text-muted leading-relaxed">
        We found two copies that look similar. Choose which one to keep — the other will be hidden, not deleted. You can always undo this later.
      </Text>

      {/* Side-by-side copy selector — radio group (mirrors ThemeControl a11y pattern) */}
      <View
        className="flex-row gap-3"
        accessibilityRole="radiogroup"
        accessibilityLabel="Which copy to keep"
      >
        <CopyCard
          doc={docs.a}
          label="Copy A"
          selected={selectedCanonicalId === docs.a.id}
          onSelect={() => { setSelectedCanonicalId(docs.a.id); }}
        />
        <CopyCard
          doc={docs.b}
          label="Copy B"
          selected={selectedCanonicalId === docs.b.id}
          onSelect={() => { setSelectedCanonicalId(docs.b.id); }}
        />
      </View>

      {/* Merge hint */}
      <Text className="font-sans text-xs text-text-muted">
        Keep the larger copy, hide the other. Merge is reversible.
      </Text>

      {/* Actions */}
      <View className="gap-3">
        {/* Merge — accent CTA: bg-accent + text-on-accent (invariant #6) */}
        <Pressable
          onPress={() => { onMerge(selectedCanonicalId); }}
          className="min-h-[44px] rounded-lg bg-accent items-center justify-center px-5"
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          accessibilityRole="button"
          accessibilityLabel="Merge: keep the selected copy and hide the other"
        >
          <Text className="font-sans text-sm font-semibold text-on-accent">
            Merge
          </Text>
        </Pressable>

        {/* Keep both — ghost/outline */}
        <Pressable
          onPress={onKeepSeparate}
          className="min-h-[44px] rounded-lg border border-line bg-surface items-center justify-center px-5"
          style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
          accessibilityRole="button"
          accessibilityLabel="Keep both copies in your library"
        >
          <Text className="font-sans text-sm font-medium text-text">
            Keep both
          </Text>
        </Pressable>

        {/* Not now — quiet text */}
        <Pressable
          onPress={onDismiss}
          className="min-h-[44px] items-center justify-center px-3"
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          accessibilityRole="button"
          accessibilityLabel="Not now, dismiss this prompt for this session"
        >
          <Text className="font-sans text-sm text-text-muted">
            Not now
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
