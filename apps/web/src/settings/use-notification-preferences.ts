/**
 * use-notification-preferences.ts — thin web hook for notification preferences.
 *
 * Web analog of mobile's use-notification-preferences.ts. All decision logic
 * defers to the store's normalizePrefs guard (17c); this hook is pure UI glue.
 *
 * Invariants:
 *  #1  Reads stay local (window focus re-read on tab return, off render path).
 *  #5  Zero decision logic here — the store normalises prefs on write/read.
 *  #6  No styling here — UI layer owns tokens.
 *
 * Load once on mount (cancelled-flag guard) + re-read on window 'focus' so a sync
 * from another device reflects when the user returns to the tab. Optimistic setters
 * update local state immediately then persist fire-and-forget / fail-soft, exactly
 * like the other thin web hooks.
 *
 * No Convex on the render path (invariant #1).
 */

import { useEffect, useState } from 'react';

import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
  type NotificationType,
} from '@ember/core';

import { useWebStore } from '../store/store-context.js';

// ── Result type ───────────────────────────────────────────────────────────────

export interface NotificationPreferencesResult {
  /** Current in-memory prefs, seeded from DEFAULT_NOTIFICATION_PREFERENCES. */
  prefs: NotificationPreferences;
  /** True once the initial load has been attempted. */
  ready: boolean;
  /** Optimistic toggle: flips a single type on/off and persists fire-and-forget. */
  setEnabledType: (type: NotificationType, enabled: boolean) => void;
  /** Optimistic setter: updates the quiet-hours window and persists fire-and-forget. */
  setQuietHours: (startHour: number, endHour: number) => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useNotificationPreferences(): NotificationPreferencesResult {
  const store = useWebStore();

  // Seed from the default so the page is renderable before the async load.
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [ready, setReady] = useState(false);

  // ── Load helper ─────────────────────────────────────────────────────────
  // Reads from the local IndexedDB store (invariant #1 — no Convex on read path).
  // Fail-soft: on error, leave prefs at current value.

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const record = await store.getNotificationPreferences();
        if (!cancelled) {
          setPrefs(record.prefs);
          setReady(true);
        }
      } catch {
        // Fail-soft: leave prefs at default; user can try again.
        if (!cancelled) setReady(true);
      }
    };

    // Initial load on mount
    void load();

    // Re-read on window focus — so a sync from another device reflects on tab return.
    const handleFocus = () => { void load(); };
    window.addEventListener('focus', handleFocus);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', handleFocus);
    };
  }, [store]);

  // ── Optimistic setters ───────────────────────────────────────────────────
  // Each builds the full next NotificationPreferences, flips local state
  // immediately, then persists fire-and-forget. On error the local state
  // remains optimistic (fail-soft); a focus re-read will resync on next return.

  const setEnabledType = (type: NotificationType, enabled: boolean) => {
    const next: NotificationPreferences = {
      ...prefs,
      enabledTypes: { ...prefs.enabledTypes, [type]: enabled },
    };
    setPrefs(next);
    void store.setNotificationPreferences(next).catch(() => {
      // Fail-soft: toggle remains flipped locally; focus re-read reconciles.
    });
  };

  const setQuietHours = (startHour: number, endHour: number) => {
    const next: NotificationPreferences = {
      ...prefs,
      quietStartHour: startHour,
      quietEndHour: endHour,
    };
    setPrefs(next);
    void store.setNotificationPreferences(next).catch(() => {
      // Fail-soft: hours remain updated locally; focus re-read reconciles.
    });
  };

  return { prefs, ready, setEnabledType, setQuietHours };
}
