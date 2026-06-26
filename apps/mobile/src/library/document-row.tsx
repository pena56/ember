import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { formatBytes } from '../store/format-bytes.js';

import type { DocumentWithSync, SyncState } from './use-library.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DocumentRowProps {
  document: DocumentWithSync;
  /** Called when the user taps "Try again" on an over-quota deferred row. */
  onRetrySync?: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(epochMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(epochMs));
}

// ── Sync badge ────────────────────────────────────────────────────────────────

/**
 * SyncBadge — warm, reassuring copy; never alarming (invariant #6 / token-only).
 *
 * - synced: null (calm — no badge)
 * - pending: "Syncing…"
 * - over-file-cap: "Too large to sync — kept on this device"
 * - over-quota: "Storage full — kept on this device" + "Try again" Pressable
 *
 * The badge Pressable stops propagation so tapping "Try again" doesn't also
 * open the document. In RN there is no nested-button validity issue, but we
 * still stop propagation to avoid both actions firing simultaneously.
 */
function SyncBadge({
  syncState,
  onRetrySync,
}: {
  syncState: SyncState;
  onRetrySync?: () => void;
}) {
  if (syncState === 'synced') {
    return null;
  }

  if (syncState === 'pending') {
    return (
      <Text className="font-sans text-xs text-text-muted opacity-60 shrink-0">
        Syncing…
      </Text>
    );
  }

  if (syncState === 'over-file-cap') {
    return (
      <Text className="font-sans text-xs text-text-muted shrink-0 text-right">
        Too large to sync — kept on this device
      </Text>
    );
  }

  if (syncState === 'over-quota') {
    return (
      <View className="items-end gap-1 shrink-0">
        <Text className="font-sans text-xs text-text-muted text-right">
          Storage full — kept on this device
        </Text>
        {onRetrySync !== undefined && (
          <Pressable
            onPress={(e) => {
              // Stop propagation so the badge tap doesn't also open the document.
              e.stopPropagation();
              onRetrySync();
            }}
            accessibilityRole="button"
            accessibilityLabel="Retry sync"
          >
            <Text className="font-sans text-xs text-accent">Try again</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Single document row — tappable Pressable that navigates to the reader.
 *
 * Uses useRouter() directly (no prop drilling through FlatList renderItem)
 * per the spec preference. Token-driven: no hardcoded colors (invariant #6).
 */
export function DocumentRow({ document: doc, onRetrySync }: DocumentRowProps) {
  const router = useRouter();

  function handlePress() {
    router.push({
      pathname: '/reader/[id]',
      params: { id: doc.id, title: doc.title },
    });
  }

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${doc.title}`}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <View className="flex-row items-center gap-4 px-5 py-4 bg-surface-raised border-b border-line">
        {/* PDF page icon (purely decorative) */}
        <View
          className="w-8 h-9 rounded bg-line items-center justify-center shrink-0"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text className="font-sans text-xs text-text-muted">PDF</Text>
        </View>

        <View className="flex-1 gap-1 min-w-0">
          <Text
            className="font-serif text-base text-text leading-snug"
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {doc.title}
          </Text>
          <Text
            className="font-sans text-xs text-text-muted"
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {doc.filename}
            {' · '}
            {formatBytes(doc.byteSize)}
            {' · '}
            {formatDate(doc.importedAt)}
          </Text>
        </View>

        {/* Sync badge — warm, reassuring copy; never alarming */}
        <SyncBadge
          syncState={doc.syncState}
          {...(onRetrySync !== undefined ? { onRetrySync } : {})}
        />

        {/* Chevron hint */}
        <Text
          className="font-sans text-base text-text-muted shrink-0"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          ›
        </Text>
      </View>
    </Pressable>
  );
}
