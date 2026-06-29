/**
 * settings-screen.tsx — Settings modal screen for Ember Reader.
 *
 * Presented as a modal (presentation: 'modal' in _layout.tsx) via app/settings.tsx.
 * Currently contains only the Notifications section; the section-card layout
 * leaves room for Account and Theme sections in 17b/17c.
 *
 * The route (app/settings.tsx) owns usePushEnablement() and passes pushState +
 * onEnablePush down — this component is presentational (props in, no hooks beyond
 * token resolution), matching the AccountSheet/AccountButton split.
 *
 * Token-only styling (invariant #6 — no hardcoded colors). Full a11y on the
 * Enable row (accessibilityRole="switch" + accessibilityState + label).
 */

import type React from 'react';
import type { ColorValue } from 'react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useResolveClassNames } from 'uniwind';

import type { PushControlState } from '../notify/push-control-state.js';

// ── Bespoke toggle ────────────────────────────────────────────────────────────
// A pill-track with a sliding dot, driven entirely by token classes via
// useResolveClassNames (invariant #6 — no hardcoded color props). The dot's
// alignment encodes the on/off state.

interface EmberToggleProps {
  enabled: boolean;
}

function EmberToggle({ enabled }: EmberToggleProps) {
  // The track is painted by className (bg-accent / bg-text-muted); the thumb fill
  // is resolved from bg-surface-raised so it reads cleanly on either track color
  // and re-themes with light/dark (invariant #6 — no hardcoded colors).
  const surfaceColor = useResolveClassNames('bg-surface-raised').backgroundColor as ColorValue;

  return (
    <View
      className={
        enabled
          ? 'w-11 h-7 rounded-full px-0.5 justify-center bg-accent'
          : 'w-11 h-7 rounded-full px-0.5 justify-center bg-text-muted'
      }
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        className="w-6 h-6 rounded-full"
        style={{
          backgroundColor: surfaceColor as string,
          alignSelf: enabled ? 'flex-end' : 'flex-start',
        }}
      />
    </View>
  );
}

// ── Section shell ─────────────────────────────────────────────────────────────

interface SectionProps {
  label: string;
  children: React.ReactNode;
}

function Section({ label, children }: SectionProps) {
  return (
    <View className="gap-3">
      <Text className="font-sans text-xs font-medium uppercase tracking-widest text-text-muted px-1">
        {label}
      </Text>
      <View className="bg-surface-raised rounded-2xl overflow-hidden border border-line">
        {children}
      </View>
    </View>
  );
}

// ── Notifications section ─────────────────────────────────────────────────────

interface NotificationsSectionProps {
  pushState: PushControlState;
  onEnablePush: () => void;
}

function NotificationsSection({ pushState, onEnablePush }: NotificationsSectionProps) {
  const rowLabel = pushState.enabled
    ? 'On'
    : pushState.needsSystemSettings
      ? 'Open Settings'
      : 'Enable notifications';

  // When hard-denied the row deep-links to iOS Settings — that's an action, not
  // a toggle, so it announces as a button (not a misleading "switch, off").
  // Otherwise it is a genuine on/off switch.
  const a11yProps = pushState.needsSystemSettings
    ? ({
        accessibilityRole: 'button' as const,
        accessibilityLabel: 'Push notifications',
        accessibilityHint: 'Opens iOS Settings to turn notifications on',
      })
    : ({
        accessibilityRole: 'switch' as const,
        accessibilityLabel: 'Push notifications',
        accessibilityState: { checked: pushState.enabled },
        accessibilityHint: pushState.enabled
          ? 'On — a gentle daily reading nudge'
          : 'Turns on a gentle daily reading nudge',
      });

  return (
    <Section label="Notifications">
      {/* Priming copy — warm, second person, no exclamation */}
      <View className="px-5 pt-5 pb-3">
        <Text className="font-sans text-sm leading-relaxed text-text-muted">
          Get a gentle nudge to keep your reading streak alive.
        </Text>
      </View>

      {/* Hairline divider */}
      <View className="h-px bg-line mx-5" />

      {/* Enable row */}
      <Pressable
        onPress={onEnablePush}
        {...a11yProps}
        className="flex-row items-center justify-between px-5 py-4"
      >
        <Text
          className={
            pushState.enabled
              ? 'font-sans text-sm font-medium text-text'
              : 'font-sans text-sm font-medium text-text-muted'
          }
        >
          {rowLabel}
        </Text>
        <EmberToggle enabled={pushState.enabled} />
      </Pressable>

      {/* System-settings hint — only when hard-denied. Orientation, not apology. */}
      {pushState.needsSystemSettings && (
        <View className="px-5 pb-4">
          <Text className="font-sans text-xs text-text-muted opacity-75">
            Opens iOS Settings to turn notifications on for Ember.
          </Text>
        </View>
      )}
    </Section>
  );
}

// ── Settings screen ───────────────────────────────────────────────────────────

interface SettingsScreenProps {
  pushState: PushControlState;
  onEnablePush: () => void;
}

export function SettingsScreen({ pushState, onEnablePush }: SettingsScreenProps) {
  return (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Screen title */}
      <View className="px-6 pt-8 pb-6">
        <Text className="font-serif text-3xl text-text" accessibilityRole="header">
          Settings
        </Text>
      </View>

      {/* Sections — Account and Theme cards slot in below in 17b/17c */}
      <View className="px-6 gap-8">
        <NotificationsSection pushState={pushState} onEnablePush={onEnablePush} />
      </View>
    </ScrollView>
  );
}
