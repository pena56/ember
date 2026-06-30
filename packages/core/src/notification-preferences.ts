/**
 * notification-preferences.ts — user-facing preference model for notifications.
 *
 * The persisted, syncable user shape (per-account); a later slice writes it
 * through the outbox. No platform APIs, no Date.now(), no external dependencies.
 *
 * Invariant #1: core imports no platform API.
 * Invariant #5: type-key set derived from NOTIFICATION_PRIORITY (single source).
 */

import type { NotificationConfig, NotificationType } from './notification.js';
import { DEFAULT_NOTIFICATION_CONFIG, NOTIFICATION_PRIORITY } from './notification.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The persisted, syncable user preference shape (per-account).
 * A later slice writes it through the outbox.
 *
 * quietStartHour inclusive / quietEndHour exclusive, local hours —
 * mirrors NotificationConfig's existing semantics.
 */
export type NotificationPreferences = {
  /** Per-type on/off flags. All true by default. */
  enabledTypes: Record<NotificationType, boolean>;
  /** Quiet window start (local hour, inclusive). */
  quietStartHour: number;
  /** Quiet window end (local hour, exclusive). */
  quietEndHour: number;
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

// All-true map derived from NOTIFICATION_PRIORITY (invariant #5 — single source).
const ALL_TYPES_ENABLED: Record<NotificationType, boolean> = Object.fromEntries(
  Object.keys(NOTIFICATION_PRIORITY).map((k) => [k, true]),
) as Record<NotificationType, boolean>;

/** Default preferences — all types enabled, quiet window 08:00–22:00 local. */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabledTypes: ALL_TYPES_ENABLED,
  quietStartHour: DEFAULT_NOTIFICATION_CONFIG.quietStartHour,
  quietEndHour: DEFAULT_NOTIFICATION_CONFIG.quietEndHour,
};

// ---------------------------------------------------------------------------
// resolveNotificationConfig
// ---------------------------------------------------------------------------

/**
 * Maps a (partial) user preference into a `Partial<NotificationConfig>` suitable
 * to spread into `planNotifications` / `deriveNotificationSync`'s `config`.
 *
 * - enabledTypes: merges supplied flags over the all-true default (partial input allowed).
 * - quiet-hours: clamped to integers in [0, 24]; if the result is degenerate
 *   (start >= end), falls back to the defaults (8/22) to avoid silently muting
 *   all notifications — both values are included in the output in that case.
 * - Returns a sparse Partial — omits fields the caller didn't supply, so unspecified
 *   prefs keep DEFAULT_NOTIFICATION_CONFIG when the result is spread into a config.
 */
export function resolveNotificationConfig(
  prefs?: Partial<NotificationPreferences>,
): Partial<NotificationConfig> {
  if (!prefs) return {};

  const result: Partial<NotificationConfig> = {};

  // enabledTypes: merge caller's flags over the all-true default so a partial
  // Record is safe — unspecified types remain enabled.
  if (prefs.enabledTypes !== undefined) {
    result.enabledTypes = { ...ALL_TYPES_ENABLED, ...prefs.enabledTypes };
  }

  // quiet-hours: clamp each supplied value to integer in [0, 24].
  const hasStart = prefs.quietStartHour !== undefined;
  const hasEnd = prefs.quietEndHour !== undefined;

  if (hasStart || hasEnd) {
    const clamp = (h: number): number => Math.min(24, Math.max(0, Math.round(h)));

    const rawStart = hasStart
      ? clamp(prefs.quietStartHour!)
      : DEFAULT_NOTIFICATION_CONFIG.quietStartHour;
    const rawEnd = hasEnd
      ? clamp(prefs.quietEndHour!)
      : DEFAULT_NOTIFICATION_CONFIG.quietEndHour;

    if (rawStart >= rawEnd) {
      // Degenerate window — fall back to defaults rather than silently muting all
      // notifications. Both fields are included so the spread overrides correctly.
      result.quietStartHour = DEFAULT_NOTIFICATION_CONFIG.quietStartHour;
      result.quietEndHour = DEFAULT_NOTIFICATION_CONFIG.quietEndHour;
    } else {
      if (hasStart) result.quietStartHour = rawStart;
      if (hasEnd) result.quietEndHour = rawEnd;
    }
  }

  return result;
}
