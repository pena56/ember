/**
 * settings-screen.tsx — Settings modal screen for Ember Reader.
 *
 * Presented as a modal (presentation: 'modal' in _layout.tsx) via app/settings.tsx.
 * Contains the Notifications section; the section-card layout leaves room for
 * Account and Theme sections in later slices.
 *
 * The route (app/settings.tsx) owns all hooks and passes state + callbacks down —
 * this component is presentational (props in, no hooks beyond token resolution),
 * matching the AccountSheet/AccountButton split.
 *
 * Token-only styling (invariant #6 — no hardcoded colors). Full a11y on every
 * interactive control (accessibilityRole + accessibilityState + label/hint).
 */

import type React from 'react';
import type { ColorValue } from 'react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useResolveClassNames } from 'uniwind';

import type { NotificationPreferences, NotificationType } from '@ember/core';
import { NOTIFICATION_PRIORITY } from '@ember/core';

import type { PushControlState } from '../notify/push-control-state.js';

import type { DevicePickerRow } from './device-picker-rows.js';
import { formatRelativeLastSeen } from './format-last-seen.js';
import { HourField } from './hour-field.js';

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

// ── Per-type label map ────────────────────────────────────────────────────────
// Keys come from NOTIFICATION_PRIORITY so a new type surfaces as a missing-label
// TS error (exhaustive Record) rather than a silent drop. Only this screen owns
// human copy; the model has no display strings (single-responsibility).

const TYPE_LABELS: Record<NotificationType, string> = {
  'streak-risk': 'Streak risk',
  'goal-progress': 'Goal progress',
  'best-time': 'Best time',
  'lapse-reengage': 'Lapse re-engage',
};

// Priority-ordered type list derived once at module level (invariant #5 — single source).
const ORDERED_TYPES: NotificationType[] = (
  Object.entries(NOTIFICATION_PRIORITY) as [NotificationType, number][]
)
  .sort(([, a], [, b]) => a - b)
  .map(([type]) => type);

// ── Notifications section ─────────────────────────────────────────────────────

interface NotificationsSectionProps {
  pushState: PushControlState;
  onEnablePush: () => void;
  prefs: NotificationPreferences;
  pushEnabled: boolean;
  onToggleType: (type: NotificationType, enabled: boolean) => void;
  onChangeQuietHours: (startHour: number, endHour: number) => void;
}

function NotificationsSection({
  pushState,
  onEnablePush,
  prefs,
  pushEnabled,
  onToggleType,
  onChangeQuietHours,
}: NotificationsSectionProps) {
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

      {/* Enable row — design/behaviour unchanged from 17a */}
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

      {/* Hairline before per-type section */}
      <View className="h-px bg-line mx-5" />

      {/*
       * Gated section — dimmed + non-interactive when push is off.
       * pointerEvents="none" blocks all touches on the entire subtree.
       * Individual rows still carry accessibilityState.disabled so
       * VoiceOver/TalkBack correctly announces them as unavailable.
       */}
      <View
        style={{ opacity: pushEnabled ? 1 : 0.45 }}
        pointerEvents={pushEnabled ? 'auto' : 'none'}
      >
        {/* Per-type toggle rows in NOTIFICATION_PRIORITY order */}
        {ORDERED_TYPES.map((type, index) => (
          <View key={type}>
            {index > 0 && <View className="h-px bg-line mx-5" />}
            <Pressable
              onPress={() => onToggleType(type, !prefs.enabledTypes[type])}
              disabled={!pushEnabled}
              accessibilityRole="switch"
              accessibilityLabel={TYPE_LABELS[type]}
              accessibilityState={{ checked: prefs.enabledTypes[type], disabled: !pushEnabled }}
              className="flex-row items-center justify-between px-5 py-4"
            >
              <Text className="font-sans text-sm text-text">{TYPE_LABELS[type]}</Text>
              <EmberToggle enabled={prefs.enabledTypes[type]} />
            </Pressable>
          </View>
        ))}

        {/* Hairline before quiet-hours */}
        <View className="h-px bg-line mx-5" />

        {/* Quiet hours — two HourField steppers side by side */}
        <View className="px-5 pt-4 pb-5 gap-3">
          <Text className="font-sans text-xs font-medium uppercase tracking-widest text-text-muted">
            Quiet hours
          </Text>
          <View className="flex-row gap-6">
            <HourField
              label="From"
              hour={prefs.quietStartHour}
              onChange={(h) => onChangeQuietHours(h, prefs.quietEndHour)}
              disabled={!pushEnabled}
            />
            <HourField
              label="To"
              hour={prefs.quietEndHour}
              onChange={(h) => onChangeQuietHours(prefs.quietStartHour, h)}
              disabled={!pushEnabled}
            />
          </View>
        </View>
      </View>
    </Section>
  );
}

// ── Push-device section ─────────────────────────────────────────────────────
// Concerns push *routing* (which device buzzes) — a distinct concern from the
// Notifications section's per-type/quiet-hours *content* controls, so it lives
// in its own sibling Section. NOT gated by this device's push-enablement: the
// user may designate a *different* device as primary from here.

// Exhaustive platform → display name. A new platform value becomes a TS error
// here (missing key), never a silent blank row (mirrors TYPE_LABELS above).
const PLATFORM_LABELS: Record<'ios' | 'android' | 'web', string> = {
  ios: 'iPhone',
  android: 'Android',
  web: 'Web',
};

// The "ember dot" radio indicator: a border-line ring that fills with the accent
// when selected — one accent moment, echoing the app's ember/goal-ring motif.
// The fill is resolved to a token color via useResolveClassNames (invariant #6 —
// no hardcoded colors), mirroring EmberToggle's approach.
function DeviceRadioDot({ checked }: { checked: boolean }) {
  const accentColor = useResolveClassNames('bg-accent').backgroundColor as ColorValue;

  return (
    <View
      className={
        checked
          ? 'w-6 h-6 rounded-full items-center justify-center border-2 border-accent'
          : 'w-6 h-6 rounded-full items-center justify-center border-2 border-line'
      }
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {checked && (
        <View className="w-3 h-3 rounded-full" style={{ backgroundColor: accentColor as string }} />
      )}
    </View>
  );
}

interface DeviceSectionProps {
  devices: DevicePickerRow[];
  nowMs: number;
  onSelectPrimary: (deviceId: string) => void;
}

function DeviceSection({ devices, nowMs, onSelectPrimary }: DeviceSectionProps) {
  return (
    <Section label="Push device">
      {/* Priming copy — warm, second person; conveys routing without mechanics */}
      <View className="px-5 pt-5 pb-3">
        <Text className="font-sans text-sm leading-relaxed text-text-muted">
          Choose which device gets your daily nudge when you&apos;re away.
        </Text>
      </View>

      <View className="h-px bg-line mx-5" />

      {devices.length < 2 ? (
        // A one-device picker is meaningless — show an informational row, no radio.
        <View className="px-5 py-4">
          <Text className="font-sans text-sm leading-relaxed text-text-muted">
            Only this device is registered. Sign in on another device to choose where your
            nudges land.
          </Text>
        </View>
      ) : (
        // ≥2 devices → single-select radio group. The server enforces
        // exactly-one-primary; a tokenless device stays selectable (annotated).
        devices.map((row, index) => {
          const label = PLATFORM_LABELS[row.platform];

          return (
            <View key={row.deviceId}>
              {index > 0 && <View className="h-px bg-line mx-5" />}
              <Pressable
                onPress={() => onSelectPrimary(row.deviceId)}
                accessibilityRole="radio"
                accessibilityState={{ checked: row.isPrimary }}
                accessibilityLabel={label + (row.isCurrent ? ' · This device' : '')}
                accessibilityHint="Sends your daily nudge to this device"
                className="flex-row items-center justify-between px-5 py-4 gap-3"
              >
                <View className="flex-1 gap-1">
                  {/* Platform label + "This device" chip */}
                  <View className="flex-row items-center gap-2">
                    <Text className="font-sans text-sm font-medium text-text">{label}</Text>
                    {row.isCurrent && (
                      <View className="rounded-full border border-line px-2 py-0.5">
                        <Text className="font-sans text-xs text-text-muted">This device</Text>
                      </View>
                    )}
                  </View>

                  {/* Muted last-seen line */}
                  <Text className="font-sans text-xs text-text-muted">
                    {formatRelativeLastSeen(nowMs, row.lastSeenAt)}
                  </Text>

                  {/* Tokenless annotation — selectable, but not yet receiving push */}
                  {!row.hasToken && (
                    <Text className="font-sans text-xs text-text-muted opacity-75">
                      Not receiving push yet
                    </Text>
                  )}
                </View>

                <DeviceRadioDot checked={row.isPrimary} />
              </Pressable>
            </View>
          );
        })
      )}
    </Section>
  );
}

// ── Settings screen ───────────────────────────────────────────────────────────

interface SettingsScreenProps {
  pushState: PushControlState;
  onEnablePush: () => void;
  prefs: NotificationPreferences;
  pushEnabled: boolean;
  onToggleType: (type: NotificationType, enabled: boolean) => void;
  onChangeQuietHours: (startHour: number, endHour: number) => void;
  devices: DevicePickerRow[];
  currentDeviceId: string | null;
  nowMs: number;
  onSelectPrimary: (deviceId: string) => void;
}

export function SettingsScreen({
  pushState,
  onEnablePush,
  prefs,
  pushEnabled,
  onToggleType,
  onChangeQuietHours,
  devices,
  nowMs,
  onSelectPrimary,
}: SettingsScreenProps) {
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

      {/* Sections — Account and Theme cards slot in below in later slices */}
      <View className="px-6 gap-8">
        <NotificationsSection
          pushState={pushState}
          onEnablePush={onEnablePush}
          prefs={prefs}
          pushEnabled={pushEnabled}
          onToggleType={onToggleType}
          onChangeQuietHours={onChangeQuietHours}
        />
        <DeviceSection devices={devices} nowMs={nowMs} onSelectPrimary={onSelectPrimary} />
      </View>
    </ScrollView>
  );
}
