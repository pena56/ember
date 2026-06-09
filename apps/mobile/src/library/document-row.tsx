import { Text, View } from 'react-native';

import type { Document } from '@ember/core';

import { formatBytes } from '../store/format-bytes.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DocumentRowProps {
  document: Document;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(epochMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(epochMs));
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Single document row — display-only, no press target.
 * Token-driven: no hardcoded colors or spacing (invariant #6).
 */
export function DocumentRow({ document: doc }: DocumentRowProps) {
  return (
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
    </View>
  );
}
