// notification-preferences.ts — get/set the user's notification preferences.
// Mutable settings record (not a session aggregate — invariant #3 governs derived stats,
// not config). Single record per user; cross-device conflicts resolve via HLC updatedAt
// in the unit-12 reconciler (last-write-wins).

import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type Hlc,
  encode,
  makeOutboxEntry,
  type NotificationPreferences,
} from '@ember/core';

import type { Repository } from './repository.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const NOTIFICATION_PREFERENCES_COLLECTION = 'notificationPreferences';
export const NOTIFICATION_PREFERENCES_ID = 'default';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationPreferencesRecord = {
  id: string;
  prefs: NotificationPreferences;
  /** Encoded HLC stamp — lexicographic sort agrees with compare. Empty string for the unpersisted default. */
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// getNotificationPreferences
// ---------------------------------------------------------------------------

/**
 * Fetch the stored NotificationPreferencesRecord, or return an unpersisted default when nothing is stored.
 *
 * The default has `updatedAt: ''` so any real `setNotificationPreferences` call always wins by HLC
 * compare (an encoded HLC sorts higher than the empty string).
 *
 * When a stored record exists it is normalized through the same guard `setNotificationPreferences`
 * uses — so a record written by an older/looser client still yields a full `enabledTypes` map.
 * Normalizing on read does NOT write or change `updatedAt`.
 */
export async function getNotificationPreferences(
  repo: Repository,
): Promise<NotificationPreferencesRecord> {
  const stored = await repo.get<NotificationPreferencesRecord>(
    NOTIFICATION_PREFERENCES_COLLECTION,
    NOTIFICATION_PREFERENCES_ID,
  );
  if (stored !== undefined) {
    return { ...stored, prefs: normalizePrefs(stored.prefs) };
  }
  return {
    id: NOTIFICATION_PREFERENCES_ID,
    prefs: DEFAULT_NOTIFICATION_PREFERENCES,
    updatedAt: '',
  };
}

// ---------------------------------------------------------------------------
// setNotificationPreferences
// ---------------------------------------------------------------------------

/**
 * Persist the user's notification preferences and enqueue one HLC-stamped outbox entry (invariant #2).
 *
 * - Normalizes `prefs` through `normalizePrefs` (fills missing enabledTypes keys from default,
 *   clamps quiet hours to integers in [0, 24]).
 * - Overwrites the single 'default' record (settings mutability — not a session).
 * - Exactly one outbox entry per call (mutation-log append — two calls → two entries).
 */
export async function setNotificationPreferences(
  deps: { repo: Repository; hlc: Hlc; newOutboxId: () => string },
  prefs: NotificationPreferences,
): Promise<NotificationPreferencesRecord> {
  const record: NotificationPreferencesRecord = {
    id: NOTIFICATION_PREFERENCES_ID,
    prefs: normalizePrefs(prefs),
    updatedAt: encode(deps.hlc),
  };

  await deps.repo.put(NOTIFICATION_PREFERENCES_COLLECTION, record);

  await deps.repo.enqueue(
    makeOutboxEntry({
      id: deps.newOutboxId(),
      hlc: deps.hlc,
      collection: NOTIFICATION_PREFERENCES_COLLECTION,
      recordId: NOTIFICATION_PREFERENCES_ID,
      op: 'put',
      payload: record,
    }),
  );

  return record;
}

// ---------------------------------------------------------------------------
// normalizePrefs (private)
// ---------------------------------------------------------------------------

/**
 * Light sanity guard for notification preferences — pure, no side effects.
 *
 * - `enabledTypes`: start from `DEFAULT_NOTIFICATION_PREFERENCES.enabledTypes` and overlay the
 *   supplied flags (coerced to boolean) so the map always carries every type key (single-source
 *   key set — spread the default; do not hand-list types).
 * - `quietStartHour` / `quietEndHour`: `Math.trunc`, then clamp to `[0, 24]`.
 * - No degenerate-window fallback — that is `resolveNotificationConfig`'s job at read-into-planner
 *   time in core; storage keeps the user's raw choice.
 */
function normalizePrefs(prefs: NotificationPreferences): NotificationPreferences {
  const enabledTypes = Object.fromEntries(
    Object.entries({
      ...DEFAULT_NOTIFICATION_PREFERENCES.enabledTypes,
      ...prefs.enabledTypes,
    }).map(([k, v]) => [k, Boolean(v)]),
  ) as NotificationPreferences['enabledTypes'];

  const clampHour = (h: number): number => Math.min(24, Math.max(0, Math.trunc(h)));

  return {
    enabledTypes,
    quietStartHour: clampHour(prefs.quietStartHour),
    quietEndHour: clampHour(prefs.quietEndHour),
  };
}
