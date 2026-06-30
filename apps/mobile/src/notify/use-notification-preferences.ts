/**
 * use-notification-preferences.ts — thin RN hook for notification preferences.
 *
 * Mirrors use-push-enablement.ts for the gating / lazy-port pattern. All
 * decision logic defers to the store's normalizePrefs guard (17c); this hook is
 * pure UI glue.
 *
 * Invariants:
 *  #1  Reads stay local (useFocusEffect re-read on modal return, off render path).
 *  #5  Zero decision logic here — the store normalises the prefs on write/read.
 *  #6  No styling here — UI layer owns tokens.
 *
 * Optimistic setters update local state immediately then persist fire-and-forget /
 * fail-soft, exactly like the other thin hooks.
 */

import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
  type NotificationType,
} from '@ember/core';

import { useNativeStore } from '../store/store-context.js';

// ── Result type ───────────────────────────────────────────────────────────────

export interface NotificationPreferencesResult {
  /** Current in-memory prefs, seeded from DEFAULT_NOTIFICATION_PREFERENCES. */
  prefs: NotificationPreferences;
  /** True once the SQLite store is open and the initial load has been attempted. */
  ready: boolean;
  /** Optimistic toggle: flips a single type on/off and persists fire-and-forget. */
  setEnabledType: (type: NotificationType, enabled: boolean) => void;
  /** Optimistic setter: updates the quiet-hours window and persists fire-and-forget. */
  setQuietHours: (startHour: number, endHour: number) => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useNotificationPreferences(): NotificationPreferencesResult {
  const { store, ready } = useNativeStore();

  // Seed from the default so the screen is renderable before the async load.
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);

  // ── Load on focus ─────────────────────────────────────────────────────────
  // useFocusEffect (not useEffect) so returning to the Settings modal after
  // background / a different modal re-reads the durable record rather than
  // trusting potentially-stale local state (mirrors use-push-enablement).

  const load = useCallback(() => {
    void (async () => {
      if (!ready || store === null) return;
      try {
        const record = await store.getNotificationPreferences();
        setPrefs(record.prefs);
      } catch {
        // Fail-soft: leave prefs at their current value; the user can retry.
      }
    })();
  }, [ready, store]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // ── Optimistic setters ────────────────────────────────────────────────────
  // Each builds the full next NotificationPreferences, flips local state
  // immediately, then persists fire-and-forget. On error the local state
  // remains optimistic (fail-soft); a focus re-read will resync on next open.

  const setEnabledType = useCallback(
    (type: NotificationType, enabled: boolean) => {
      const next: NotificationPreferences = {
        ...prefs,
        enabledTypes: { ...prefs.enabledTypes, [type]: enabled },
      };
      setPrefs(next);
      void store?.setNotificationPreferences(next).catch(() => {
        // Fail-soft: toggle remains flipped locally; focus re-read reconciles.
      });
    },
    [prefs, store],
  );

  const setQuietHours = useCallback(
    (startHour: number, endHour: number) => {
      const next: NotificationPreferences = {
        ...prefs,
        quietStartHour: startHour,
        quietEndHour: endHour,
      };
      setPrefs(next);
      void store?.setNotificationPreferences(next).catch(() => {
        // Fail-soft: hours remain updated locally; focus re-read reconciles.
      });
    },
    [prefs, store],
  );

  return { prefs, ready, setEnabledType, setQuietHours };
}
