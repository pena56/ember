import type { ColorValue } from 'react-native';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useResolveClassNames } from 'uniwind';

import type { Document } from '@ember/core';

import { AccountButton } from '../auth/account-button.js';
import { convex } from '../convex/convex-client.js';
import { useBlobSyncContext } from '../sync/blob-sync-context.js';
import type { ThemePreference } from '../theme/resolve-app-theme.js';
import { useTheme } from '../theme/use-theme.js';

import { DocumentRow } from './document-row.js';
import { DuplicatePrompt } from './duplicate-prompt.js';
import { EmberFlame } from './ember-flame.js';
import { ImportCard } from './import-card.js';
import { StorageMeter } from './storage-meter.js';
import { useDuplicates } from './use-duplicates.js';
import type { DocumentWithSync } from './use-library.js';
import { useLibrary } from './use-library.js';

// ── Theme control ─────────────────────────────────────────────────────────────

type SegmentOption = {
  label: string;
  value: ThemePreference;
};

const SEGMENTS: SegmentOption[] = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'warm-light' },
  { label: 'Dark', value: 'warm-dark' },
];

function ThemeControl() {
  const { preference, setPreference } = useTheme();

  return (
    <View
      className="flex-row rounded-md border border-line overflow-hidden bg-surface-raised"
      accessibilityRole="radiogroup"
      accessibilityLabel="Theme"
    >
      {SEGMENTS.map(({ label, value }) => {
        const isActive = preference === value;
        return (
          <Pressable
            key={value}
            className={
              isActive
                ? 'px-4 py-2 border-b-2 border-accent'
                : 'px-4 py-2 border-b-2 border-transparent'
            }
            onPress={() => { setPreference(value); }}
            accessibilityRole="radio"
            accessibilityState={{ checked: isActive }}
            accessibilityLabel={label}
          >
            <Text
              className={
                isActive
                  ? 'font-sans text-sm text-text font-medium'
                  : 'font-sans text-sm text-text-muted'
              }
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <View className="flex-1 items-center justify-center gap-4 py-16">
      {/* Ember motif — the brand flame, matching the web Library */}
      <View
        className="opacity-50"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <EmberFlame />
      </View>

      <View className="items-center gap-2 px-8">
        <Text className="font-serif text-lg text-text-muted text-center">
          Your library is waiting for its first spark
        </Text>
        <Text className="font-sans text-sm text-text-muted text-center opacity-70">
          Add a PDF above to begin. Every great collection starts with a single page.
        </Text>
      </View>
    </View>
  );
}

// ── Library screen ────────────────────────────────────────────────────────────

/**
 * LibraryScreen — composes header, storage meter, import card, list/empty state.
 *
 * The single blob-sync scheduler is mounted in AnonymousAuthGate (_layout.tsx).
 * retryDeferred is threaded down via BlobSyncContext (one mount, no second scheduler).
 */
export function LibraryScreen() {
  const { documents, loading, pickAndImport } = useLibrary();
  const { retryDeferred } = useBlobSyncContext();
  const {
    current: currentPair,
    currentDocs,
    defaultCanonicalId,
    merge,
    keepSeparate,
    dismiss,
  } = useDuplicates();
  // Token-driven spinner tint (invariant #6) — resolved through uniwind, re-themes with light/dark.
  const accent = useResolveClassNames('bg-accent').backgroundColor as ColorValue;

  function renderRow({ item }: { item: DocumentWithSync }) {
    const onRetry =
      item.syncState === 'over-quota' ? () => { void retryDeferred(); } : undefined;
    return (
      <DocumentRow
        document={item}
        {...(onRetry !== undefined ? { onRetrySync: onRetry } : {})}
      />
    );
  }

  function keyExtractor(item: Document) {
    return item.id;
  }

  return (
    // The page background must live on a core View — uniwind's className only
    // applies to RN core / withUniwind-wrapped components, NOT the third-party
    // SafeAreaView (02d carry-forward). SafeAreaView handles top insets only.
    <View className="flex-1 bg-surface">
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-line">
        <Text className="font-serif text-2xl text-text" accessibilityRole="header">
          Ember
        </Text>
        <View className="flex-row items-center gap-3">
          <ThemeControl />
          {/* Account affordance only when Convex is configured. Offline-local
              (no EXPO_PUBLIC_CONVEX_URL) has no provider above it, so mounting
              AccountButton — which reads convex hooks — would crash (invariant #1). */}
          {convex !== null && <AccountButton />}
        </View>
      </View>

      {/* Content */}
      {loading && documents.length === 0 ? (
        <View
          className="flex-1 items-center justify-center"
          accessibilityRole="none"
          accessibilityState={{ busy: true }}
          accessibilityLabel="Loading your library"
        >
          <ActivityIndicator
            size="small"
            color={accent}
            accessibilityElementsHidden
          />
        </View>
      ) : (
        <FlatList
          data={documents}
          keyExtractor={keyExtractor}
          renderItem={renderRow}
          contentContainerStyle={{ flexGrow: 1 }}
          ListHeaderComponent={
            <View className="px-4 pt-6 pb-4 gap-4">
              {/* Page title */}
              <View className="gap-1">
                <Text className="font-serif text-3xl text-text">Library</Text>
                {documents.length > 0 && (
                  <Text className="font-sans text-sm text-text-muted">
                    {documents.length === 1
                      ? '1 book in your collection'
                      : `${documents.length.toString()} books in your collection`}
                  </Text>
                )}
              </View>

              {/* Import card */}
              <ImportCard onPickPdf={() => { void pickAndImport(); }} disabled={loading} />

              {/* Duplicate prompt — shown when an undecided pair exists (below ImportCard) */}
              {currentPair !== undefined && currentDocs !== undefined && defaultCanonicalId !== undefined && (
                <DuplicatePrompt
                  pair={currentPair}
                  docs={currentDocs}
                  defaultCanonicalId={defaultCanonicalId}
                  onMerge={(canonicalId) => { void merge(currentPair, canonicalId); }}
                  onKeepSeparate={() => { void keepSeparate(currentPair); }}
                  onDismiss={() => { dismiss(currentPair); }}
                />
              )}

              {/* Storage quota meter — hidden when unauthenticated / loading */}
              {convex !== null && <StorageMeter />}
            </View>
          }
          ListEmptyComponent={<EmptyState />}
        />
      )}
      </SafeAreaView>
    </View>
  );
}
