/**
 * push-device-card.tsx — presentational "Push device" card for the Settings page.
 *
 * Pure props-in, no data hooks — designed to be jsdom-testable without any
 * Convex or bundle mocking. The parent page (settings-page.tsx) owns the hook
 * and passes state + callbacks down.
 *
 * Sits after <NotificationsCard> as a sibling section card — same rounded-2xl
 * bg-surface-raised border border-line shell. Routing (which device buzzes) is
 * a distinct concern from per-type/quiet-hours content controls.
 *
 * Token-only styling (invariant #6 — no hardcoded colors).
 * PLATFORM_LABELS is exhaustive (Record) so a new platform → TS error, not
 * a silent blank.
 */

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group.js';

import type { DevicePickerRow } from './device-picker-rows.js';
import { formatRelativeLastSeen } from './format-last-seen.js';
import { SettingsSection } from './settings-section.js';

// ── Platform label map ────────────────────────────────────────────────────────
// Exhaustive Record: a new platform value in the union causes a TS error here,
// not a silent blank row (mirrors TYPE_LABELS in settings-page.tsx).

const PLATFORM_LABELS: Record<'ios' | 'android' | 'web', string> = {
  ios: 'iPhone',
  android: 'Android',
  web: 'Web',
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface PushDeviceCardProps {
  rows: DevicePickerRow[];
  /** Epoch-ms captured by the hook on last refresh — never call Date.now() here. */
  nowMs: number;
  onSelectPrimary: (deviceId: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PushDeviceCard({ rows, nowMs, onSelectPrimary }: PushDeviceCardProps) {
  // Find the currently-primary device's id to feed RadioGroup value.
  const primaryDeviceId = rows.find((r) => r.isPrimary)?.deviceId ?? '';

  return (
    <SettingsSection
      title="Push device"
      description="Choose which device gets your daily nudge when you're away."
    >
      {rows.length < 2 ? (
        /* ── Single / zero devices — informational row (no radio) ── */
        <div className="px-5 py-4">
          <p className="font-sans text-sm leading-relaxed text-text-muted">
            Only this device is registered. Sign in on another device to choose where
            your daily nudge lands.
          </p>
        </div>
      ) : (
        /* ── Two or more devices — single-select RadioGroup ── */
        <RadioGroup
          value={primaryDeviceId}
          onValueChange={onSelectPrimary}
          className="divide-y divide-line"
        >
          {rows.map((row) => {
            const platformLabel = PLATFORM_LABELS[row.platform];
            const itemId = `push-device-${row.deviceId}`;

            return (
              /* Each row is a <label> wrapping row content + radio — clicking anywhere selects */
              <label
                key={row.deviceId}
                htmlFor={itemId}
                className="flex items-center gap-4 px-5 py-3.5 cursor-pointer select-none transition-colors hover:bg-surface/60"
              >
                {/* Left: device info */}
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  {/* Platform label + "This device" chip */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-sans text-sm font-medium text-text">
                      {platformLabel}
                    </span>
                    {row.isCurrent && (
                      <span className="rounded-full border border-line px-2 py-0.5 font-sans text-xs text-text-muted leading-none">
                        This device
                      </span>
                    )}
                  </div>

                  {/* Last-seen — muted, formatted relative time */}
                  <span className="font-sans text-xs text-text-muted">
                    {formatRelativeLastSeen(nowMs, row.lastSeenAt)}
                  </span>

                  {/* Tokenless annotation — selectable but not yet receiving push */}
                  {!row.hasToken && (
                    <span className="font-sans text-xs text-text-muted opacity-70">
                      Not receiving push yet
                    </span>
                  )}
                </div>

                {/* Right: ember-dot radio indicator */}
                <RadioGroupItem
                  id={itemId}
                  value={row.deviceId}
                  aria-label={
                    platformLabel + (row.isCurrent ? ' · This device' : '')
                  }
                />
              </label>
            );
          })}
        </RadioGroup>
      )}
    </SettingsSection>
  );
}
