import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { Tag } from '@ember/core';

import { formatBytes } from '../store/format-bytes.js';

import { TAG_BG } from './tag-colors.js';
import type { DocumentWithSync, SyncState } from './use-library.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DocumentRowProps {
  document: DocumentWithSync;
  /** Called when the user taps "Try again" on an over-quota deferred row. */
  onRetrySync?: () => void;
  /** Tags currently applied to this document (live, orphan-free). */
  tags?: Tag[];
  /** Called when a tag chip is tapped — sets the active view to that tag filter. */
  onTagPress?: (tagId: string) => void;
  /** Called when the × on a chip is tapped — untags this doc. */
  onUntagDoc?: (tagId: string) => void;
  /** Called when the + add-tag button is tapped — opens the picker. */
  onAddTag?: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(epochMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(epochMs));
}

/**
 * Spoken status for screen readers. A Pressable with an accessibilityLabel is
 * announced as ONE element, so its child SyncBadge text is never read — the
 * status must be folded into the row label instead. Comma-phrased (no em dash)
 * so VoiceOver/TalkBack pause naturally. Empty string = nothing to announce.
 */
const STATUS_A11Y: Record<SyncState, string> = {
  synced: '',
  pending: 'Syncing',
  'over-file-cap': 'Too large to sync, kept on this device',
  'over-quota': 'Storage full, kept on this device',
};

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
      <Text
        className="font-sans text-xs text-text-muted shrink-0 text-right leading-tight"
        style={{ maxWidth: 150 }}
      >
        Too large to sync — kept on this device
      </Text>
    );
  }

  if (syncState === 'over-quota') {
    return (
      <View className="items-end gap-1 shrink-0" style={{ maxWidth: 150 }}>
        <Text className="font-sans text-xs text-text-muted text-right leading-tight">
          Storage full — kept on this device
        </Text>
        {onRetrySync !== undefined && (
          <Pressable
            onPress={(e) => {
              // Stop propagation so the badge tap doesn't also open the document.
              e.stopPropagation();
              onRetrySync();
            }}
            // Pad the hit area out to a comfortable touch target — the visible
            // text is only ~16px tall (WCAG 2.5.5 / platform HIG want ≥44pt).
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            className="py-1"
            // The row exposes retry as an accessibilityAction (see DocumentRow),
            // so hide this visual control from AT to avoid a dead duplicate.
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
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
export function DocumentRow({ document: doc, onRetrySync, tags, onTagPress, onUntagDoc, onAddTag }: DocumentRowProps) {
  const router = useRouter();

  function handlePress() {
    router.push({
      pathname: '/reader/[id]',
      params: { id: doc.id, title: doc.title },
    });
  }

  // Fold sync status into the row label so screen readers announce it (the row
  // is a single a11y element — the badge Text alone would never be read).
  const status = STATUS_A11Y[doc.syncState];
  const accessibilityLabel = status ? `Open ${doc.title}. ${status}` : `Open ${doc.title}`;

  // When over quota, expose "Try again" as a row accessibilityAction (the nested
  // visual control isn't focusable inside a single-element row).
  const canRetry = doc.syncState === 'over-quota' && onRetrySync !== undefined;

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      {...(canRetry
        ? {
            accessibilityActions: [{ name: 'retry', label: 'Try syncing again' }],
            onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => {
              if (e.nativeEvent.actionName === 'retry') onRetrySync?.();
            },
          }
        : {})}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <View className="bg-surface-raised border-b border-line">
        {/* Main row */}
        <View className="flex-row items-center gap-4 px-5 py-4">
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

        {/* Tag chips — rendered below the main row when tags are present or add-tag is available */}
        {((tags !== undefined && tags.length > 0) || onAddTag !== undefined) && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 10, gap: 6 }}
          >
            {(tags ?? []).map((tag) => (
              <View key={tag.id} className={`flex-row items-center rounded-full px-2.5 py-1 gap-1 ${TAG_BG[tag.color]}`}>
                {/* Chip tap → set ad-hoc tag filter */}
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    onTagPress?.(tag.id);
                  }}
                  hitSlop={{ top: 6, bottom: 6, left: 4, right: 0 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Filter by ${tag.name}`}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <Text className="font-sans text-xs text-text" numberOfLines={1} style={{ maxWidth: 120 }}>
                    {tag.name}
                  </Text>
                </Pressable>

                {/* × untag */}
                {onUntagDoc !== undefined && (
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      onUntagDoc(tag.id);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 6 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${tag.name} tag`}
                    style={({ pressed }) => ({ opacity: pressed ? 0.5 : 0.6 })}
                  >
                    <Text className="font-sans text-xs text-text">×</Text>
                  </Pressable>
                )}
              </View>
            ))}

            {/* + add tag */}
            {onAddTag !== undefined && (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  onAddTag();
                }}
                className="flex-row items-center rounded-full px-2.5 py-1 border border-line"
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel="Add tag"
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 0.7 })}
              >
                <Text className="font-sans text-xs text-text-muted">＋</Text>
              </Pressable>
            )}
          </ScrollView>
        )}
      </View>
    </Pressable>
  );
}
