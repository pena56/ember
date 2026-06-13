/**
 * stat-card.tsx — reusable card wrapper for Stats section components.
 *
 * Card aesthetic mirrors habit-header.tsx: bg-surface-raised, border-line,
 * rounded-2xl. Optional section title in small uppercase Inter.
 * Token-only styling (invariant #6).
 */

import React from 'react';
import { Text, View } from 'react-native';

// ── Props ─────────────────────────────────────────────────────────────────────

interface StatCardProps {
  title?: string;
  accessibilityLabel?: string;
  children: React.ReactNode;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StatCard({ title, accessibilityLabel, children }: StatCardProps) {
  return (
    <View
      className="bg-surface-raised border border-line rounded-2xl px-5 py-5"
      accessibilityLabel={accessibilityLabel}
    >
      {title !== undefined && title.length > 0 && (
        <Text className="font-sans text-xs uppercase tracking-widest text-text-muted mb-3">
          {title}
        </Text>
      )}
      {children}
    </View>
  );
}
