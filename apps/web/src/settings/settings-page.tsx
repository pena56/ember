/**
 * settings-page.tsx — Settings tab for Ember web.
 *
 * Dedicated /settings route inside the AppShell layout. Column shell matches
 * the other tabs: mx-auto w-full max-w-2xl px-6 py-10.
 *
 * Contains a Notifications section card (rounded-2xl bg-surface-raised border
 * border-line) with:
 *  - Four per-type Switch toggles in NOTIFICATION_PRIORITY order.
 *  - A Quiet hours row with two HourField steppers.
 *
 * NOTE: The toggles here persist + sync via the outbox but are behaviourally
 * inert until Issue #150 (Unit 17f) wires prefs into deriveNotificationSync on
 * both platforms. This is by design — do not treat as a bug.
 *
 * Token-only styling (invariant #6 — no hardcoded colors).
 * Type-labels are exhaustive (Record<NotificationType, string>) so a new type
 * → TS error, not a silent drop.
 */

import type { NotificationPreferences, NotificationType } from '@ember/core';
import { NOTIFICATION_PRIORITY } from '@ember/core';

import { Switch } from '@/components/ui/switch.js';

import { AccountSection } from './account-section.js';
import { AppearanceSection } from './appearance-section.js';
import { deriveDevicePickerRows } from './device-picker-rows.js';
import { HourField } from './hour-field.js';
import { PushDeviceCard } from './push-device-card.js';
import { SettingsSection } from './settings-section.js';
import { useNotificationPreferences } from './use-notification-preferences.js';
import { usePrimaryDevice } from './use-primary-device.js';

// ── Label map ─────────────────────────────────────────────────────────────────
// Exhaustive Record so a new NotificationType causes a TS error here (not a silent drop).

const TYPE_LABELS: Record<NotificationType, string> = {
  'streak-risk': 'Streak risk',
  'goal-progress': 'Goal progress',
  'best-time': 'Best time',
  'lapse-reengage': 'Lapse re-engage',
};

// Priority-ordered type list derived at module level from NOTIFICATION_PRIORITY
// (invariant #5 — single source; do not hand-list types).
const ORDERED_TYPES: NotificationType[] = (
  Object.entries(NOTIFICATION_PRIORITY) as [NotificationType, number][]
)
  .sort(([, a], [, b]) => a - b)
  .map(([type]) => type);

// ── Notifications card ────────────────────────────────────────────────────────

interface NotificationsCardProps {
  prefs: NotificationPreferences;
  onToggleType: (type: NotificationType, enabled: boolean) => void;
  onChangeQuietHours: (start: number, end: number) => void;
}

function NotificationsCard({ prefs, onToggleType, onChangeQuietHours }: NotificationsCardProps) {
  return (
    <SettingsSection
      title="Notifications"
      description="Get a gentle nudge to keep your reading streak alive — choose which reminders feel right."
    >
      {/*
       * Per-type toggle rows in NOTIFICATION_PRIORITY order.
       *
       * NOTE: These toggles persist + sync but are behaviourally inert until
       * Issue #150 (Unit 17f) wires them into deriveNotificationSync. By design.
       */}
      <div className="divide-y divide-line">
        {ORDERED_TYPES.map((type) => (
          <div
            key={type}
            className="flex items-center justify-between gap-4 px-5 py-3.5"
          >
            <label
              htmlFor={`pref-${type}`}
              className="font-sans text-sm text-text cursor-pointer select-none flex-1"
            >
              {TYPE_LABELS[type]}
            </label>
            {/* The visible <label htmlFor> names the switch; no aria-label needed. */}
            <Switch
              id={`pref-${type}`}
              checked={prefs.enabledTypes[type]}
              onCheckedChange={(checked) => { onToggleType(type, checked); }}
            />
          </div>
        ))}
      </div>

      {/* Quiet hours — two HourField steppers, set apart by a hairline */}
      <div className="flex flex-col gap-4 border-t border-line px-5 py-4">
        <div className="flex flex-col gap-0.5">
          <p className="font-sans text-sm text-text">Quiet hours</p>
          <p className="font-sans text-sm text-text-muted">
            The window when Ember will reach you. It stays quiet outside these hours.
          </p>
        </div>
        <div className="flex items-start gap-6">
          <HourField
            label="From"
            hour={prefs.quietStartHour}
            onChange={(h) => { onChangeQuietHours(h, prefs.quietEndHour); }}
          />
          <HourField
            label="To"
            hour={prefs.quietEndHour}
            onChange={(h) => { onChangeQuietHours(prefs.quietStartHour, h); }}
          />
        </div>
      </div>
    </SettingsSection>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { prefs, setEnabledType, setQuietHours } = useNotificationPreferences();
  const { devices, currentDeviceId, nowMs, setPrimary } = usePrimaryDevice();
  const deviceRows = deriveDevicePickerRows({ devices, currentDeviceId });

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12 flex flex-col gap-9">
      {/* Page heading — font-serif per the other tab headings */}
      <header className="flex flex-col gap-1.5">
        <h1 className="font-serif text-4xl font-semibold text-text leading-tight tracking-tight text-balance">
          Settings
        </h1>
        <p className="font-sans text-sm text-text-muted">
          Adjust how Ember keeps you company while you read.
        </p>
      </header>

      {/* Sections */}
      <div className="flex flex-col gap-8">
        <AccountSection />
        <AppearanceSection />
        <NotificationsCard
          prefs={prefs}
          onToggleType={setEnabledType}
          onChangeQuietHours={setQuietHours}
        />
        <PushDeviceCard
          rows={deviceRows}
          nowMs={nowMs}
          onSelectPrimary={setPrimary}
        />
      </div>
    </div>
  );
}
