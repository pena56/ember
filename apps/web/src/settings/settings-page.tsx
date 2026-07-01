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

import { deriveDevicePickerRows } from './device-picker-rows.js';
import { HourField } from './hour-field.js';
import { PushDeviceCard } from './push-device-card.js';
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
    <section aria-label="Notifications" className="flex flex-col gap-3">
      {/* Section header — uppercase caption */}
      <p className="font-sans text-xs font-medium uppercase tracking-widest text-text-muted px-1">
        Notifications
      </p>

      {/* Card */}
      <div className="rounded-2xl bg-surface-raised border border-line overflow-hidden">
        {/* Priming copy — warm, second person, no exclamation (brand voice) */}
        <div className="px-5 pt-5 pb-4">
          <p className="font-sans text-sm leading-relaxed text-text-muted">
            Get a gentle nudge to keep your reading streak alive. Choose which reminders
            feel right for you.
          </p>
        </div>

        {/* Hairline */}
        <div className="h-px bg-line mx-5" aria-hidden="true" />

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
              className="flex items-center justify-between gap-4 px-5 py-4"
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

        {/* Hairline before quiet hours */}
        <div className="h-px bg-line mx-5" aria-hidden="true" />

        {/* Quiet hours — two HourField steppers */}
        <div className="px-5 pt-4 pb-5 flex flex-col gap-4">
          <p className="font-sans text-xs font-medium uppercase tracking-widest text-text-muted">
            Quiet hours
          </p>
          <div className="flex items-start gap-8">
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
      </div>
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { prefs, setEnabledType, setQuietHours } = useNotificationPreferences();
  const { devices, currentDeviceId, nowMs, setPrimary } = usePrimaryDevice();
  const deviceRows = deriveDevicePickerRows({ devices, currentDeviceId });

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10 flex flex-col gap-10">
      {/* Page heading — font-serif per the other tab headings */}
      <div className="flex flex-col gap-1.5">
        <h1 className="font-serif text-4xl font-semibold text-text leading-tight tracking-tight">
          Settings
        </h1>
        <p className="font-sans text-sm text-text-muted mt-0.5">
          Adjust how Ember keeps you company while you read.
        </p>
      </div>

      {/* Thin accent separator matching stats-page */}
      <div className="h-px w-12 bg-line -mt-6" aria-hidden="true" />

      {/* Sections — Account and Theme sections grow this page in later slices */}
      <div className="flex flex-col gap-8">
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
