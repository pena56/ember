// notification-preferences.test.ts — pure preference model + resolveNotificationConfig.
// No platform APIs; no Date.now(). All fixtures use fixed epochs + explicit tzOffsetMinutes.

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  resolveNotificationConfig,
  type NotificationPreferences,
} from '../notification-preferences.js';
import {
  DEFAULT_NOTIFICATION_CONFIG,
  NOTIFICATION_PRIORITY,
  planNotifications,
  type NotificationConfig,
  type NotificationType,
} from '../notification.js';
import type { ReadingSession } from '../session.js';

// ---------------------------------------------------------------------------
// Fixture helpers (matches notification.test.ts style)
// ---------------------------------------------------------------------------

let _id = 0;

function mk(
  localDay: string,
  activeMs: number,
  opts: { startedAt?: number; tzOffsetMinutes?: number } = {},
): ReadingSession {
  const tzOffsetMinutes = opts.tzOffsetMinutes ?? 0;
  const startedAt =
    opts.startedAt ??
    Date.parse(localDay + 'T00:00:00Z') - tzOffsetMinutes * 60_000 + 20 * 3_600_000;
  return {
    id: `sp${++_id}`,
    docId: 'doc-pref',
    localDay,
    tzOffsetMinutes,
    startedAt,
    endedAt: startedAt + activeMs,
    activeMs,
    pages: [1],
    updatedAt: '',
  };
}

// A fixed "now" that resolves to 2026-06-28 at 14:00 UTC (UTC+0) — same as notification.test.ts.
const NOW_UTC = Date.parse('2026-06-28T14:00:00Z');
const TODAY_UTC = '2026-06-28';

// All types derived from NOTIFICATION_PRIORITY (single source, invariant #5).
const NOTIFICATION_TYPES = Object.keys(NOTIFICATION_PRIORITY) as NotificationType[];

// ---------------------------------------------------------------------------
// DEFAULT_NOTIFICATION_PREFERENCES shape
// ---------------------------------------------------------------------------

describe('DEFAULT_NOTIFICATION_PREFERENCES', () => {
  it('has all four notification types enabled', () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(DEFAULT_NOTIFICATION_PREFERENCES.enabledTypes[type]).toBe(true);
    }
  });

  it('quiet hours match DEFAULT_NOTIFICATION_CONFIG', () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES.quietStartHour).toBe(
      DEFAULT_NOTIFICATION_CONFIG.quietStartHour,
    );
    expect(DEFAULT_NOTIFICATION_PREFERENCES.quietEndHour).toBe(
      DEFAULT_NOTIFICATION_CONFIG.quietEndHour,
    );
  });

  it('enabledTypes key set equals the keys of NOTIFICATION_PRIORITY', () => {
    expect(Object.keys(DEFAULT_NOTIFICATION_PREFERENCES.enabledTypes).sort()).toEqual(
      NOTIFICATION_TYPES.slice().sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// resolveNotificationConfig — default parity
// ---------------------------------------------------------------------------

describe('resolveNotificationConfig — default parity', () => {
  it('resolveNotificationConfig(DEFAULT_NOTIFICATION_PREFERENCES) spread into planNotifications yields byte-identical output to no-config', () => {
    // at-risk streak: session yesterday, goal unmet today
    const sessions = [mk('2026-06-27', 1_200_001)];
    const base = { sessions, now: NOW_UTC, tzOffsetMinutes: 0 };

    const noConfigResult = planNotifications(base);
    const resolvedConfig = resolveNotificationConfig(DEFAULT_NOTIFICATION_PREFERENCES);
    const withDefaultPrefsResult = planNotifications({ ...base, config: resolvedConfig });

    expect(withDefaultPrefsResult).toEqual(noConfigResult);
  });

  it('resolveNotificationConfig(undefined) returns an empty object', () => {
    expect(resolveNotificationConfig(undefined)).toEqual({});
  });

  it('resolveNotificationConfig({}) returns an empty object (all fields omitted)', () => {
    expect(resolveNotificationConfig({})).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// resolveNotificationConfig — disabling a single type
// ---------------------------------------------------------------------------

describe('resolveNotificationConfig — disabling one type', () => {
  it('disabling streak-risk removes it from candidates; goal-progress becomes selected', () => {
    // Setup: at-risk streak + partial progress today → streak-risk + goal-progress + best-time qualify
    const goalMs = DEFAULT_NOTIFICATION_CONFIG.goalTargetMs;
    const sessions = [
      mk('2026-06-27', goalMs),                   // yesterday — at-risk streak
      mk(TODAY_UTC, Math.floor(goalMs / 2)),       // today partial — goal-progress fires
    ];

    const config = resolveNotificationConfig({
      enabledTypes: { 'streak-risk': false } as Partial<Record<NotificationType, boolean>> as Record<NotificationType, boolean>,
    });

    const { candidates, selected } = planNotifications({
      sessions,
      now: NOW_UTC,
      tzOffsetMinutes: 0,
      config,
    });

    // streak-risk is absent
    expect(candidates.find((c) => c.type === 'streak-risk')).toBeUndefined();
    // goal-progress is present (next enabled lower-priority type becomes selected)
    expect(candidates.find((c) => c.type === 'goal-progress')).toBeDefined();
    expect(selected?.type).toBe('goal-progress');
  });

  it('disabling best-time removes exactly that type; other eligible types remain', () => {
    const goalMs = DEFAULT_NOTIFICATION_CONFIG.goalTargetMs;
    const sessions = [mk('2026-06-27', goalMs)]; // at-risk streak, no today sessions

    const config = resolveNotificationConfig({
      enabledTypes: { 'best-time': false } as Partial<Record<NotificationType, boolean>> as Record<NotificationType, boolean>,
    });

    const { candidates } = planNotifications({
      sessions,
      now: NOW_UTC,
      tzOffsetMinutes: 0,
      config,
    });

    expect(candidates.find((c) => c.type === 'best-time')).toBeUndefined();
    // streak-risk still fires
    expect(candidates.find((c) => c.type === 'streak-risk')).toBeDefined();
  });

  it('merges partial enabledTypes over all-true default — unspecified types remain enabled', () => {
    const prefs: Partial<NotificationPreferences> = {
      enabledTypes: { 'lapse-reengage': false } as Partial<Record<NotificationType, boolean>> as Record<NotificationType, boolean>,
    };
    const config = resolveNotificationConfig(prefs);

    // All other types should be true
    for (const type of NOTIFICATION_TYPES) {
      if (type === 'lapse-reengage') {
        expect(config.enabledTypes![type]).toBe(false);
      } else {
        expect(config.enabledTypes![type]).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// resolveNotificationConfig — all types disabled
// ---------------------------------------------------------------------------

describe('resolveNotificationConfig — all types disabled', () => {
  it('disabling all four types yields selected null and candidates []', () => {
    const allDisabled = Object.fromEntries(
      NOTIFICATION_TYPES.map((t) => [t, false]),
    ) as Record<NotificationType, boolean>;

    const config = resolveNotificationConfig({ enabledTypes: allDisabled });

    const sessions = [mk('2026-06-27', 1_200_001)]; // would otherwise fire streak-risk
    const { candidates, selected } = planNotifications({
      sessions,
      now: NOW_UTC,
      tzOffsetMinutes: 0,
      config,
    });

    expect(candidates).toEqual([]);
    expect(selected).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveNotificationConfig — custom quiet hours
// ---------------------------------------------------------------------------

describe('resolveNotificationConfig — custom quiet hours', () => {
  it('narrows quiet window so anchor hours outside it are dropped', () => {
    // streakRiskHour=21 is outside [8,21) — setting quietEndHour=21 drops it
    const config = resolveNotificationConfig({ quietEndHour: 21 });
    expect(config.quietEndHour).toBe(21);

    const sessions = [mk('2026-06-27', 1_200_001)]; // at-risk streak
    const { candidates } = planNotifications({
      sessions,
      now: NOW_UTC,
      tzOffsetMinutes: 0,
      config,
    });

    expect(candidates.find((c) => c.type === 'streak-risk')).toBeUndefined();
  });

  it('shifts quiet window so goal-progress (hour 15) is excluded', () => {
    // Move quiet window to [16, 22) — goalProgressHour=15 falls outside
    const config = resolveNotificationConfig({ quietStartHour: 16 });
    expect(config.quietStartHour).toBe(16);

    const goalMs = DEFAULT_NOTIFICATION_CONFIG.goalTargetMs;
    const sessions = [mk(TODAY_UTC, Math.floor(goalMs / 2))];
    const { candidates } = planNotifications({
      sessions,
      now: NOW_UTC,
      tzOffsetMinutes: 0,
      config,
    });

    expect(candidates.find((c) => c.type === 'goal-progress')).toBeUndefined();
  });

  it('clamps out-of-range hours to [0, 24]', () => {
    const config = resolveNotificationConfig({ quietStartHour: -5, quietEndHour: 30 });
    expect(config.quietStartHour).toBe(0);
    expect(config.quietEndHour).toBe(24);
  });

  it('rounds fractional hours to nearest integer', () => {
    const config = resolveNotificationConfig({ quietStartHour: 7.6, quietEndHour: 21.3 });
    expect(config.quietStartHour).toBe(8);
    expect(config.quietEndHour).toBe(21);
  });

  it('degenerate start === end falls back to defaults 8/22', () => {
    const config = resolveNotificationConfig({ quietStartHour: 12, quietEndHour: 12 });
    expect(config.quietStartHour).toBe(DEFAULT_NOTIFICATION_CONFIG.quietStartHour);
    expect(config.quietEndHour).toBe(DEFAULT_NOTIFICATION_CONFIG.quietEndHour);
  });

  it('degenerate start > end falls back to defaults 8/22', () => {
    const config = resolveNotificationConfig({ quietStartHour: 20, quietEndHour: 8 });
    expect(config.quietStartHour).toBe(DEFAULT_NOTIFICATION_CONFIG.quietStartHour);
    expect(config.quietEndHour).toBe(DEFAULT_NOTIFICATION_CONFIG.quietEndHour);
  });

  it('degenerate start >= end after clamping falls back to defaults 8/22', () => {
    // 25 clamps to 24; 25 clamps to 24 → 24 >= 24 → degenerate
    const config = resolveNotificationConfig({ quietStartHour: 25, quietEndHour: 25 });
    expect(config.quietStartHour).toBe(DEFAULT_NOTIFICATION_CONFIG.quietStartHour);
    expect(config.quietEndHour).toBe(DEFAULT_NOTIFICATION_CONFIG.quietEndHour);
  });

  it('valid degenerate fallback still lets planNotifications run correctly (not muted)', () => {
    // If degenerate fell back to [8,22) instead of muting, candidates should appear
    const config = resolveNotificationConfig({ quietStartHour: 23, quietEndHour: 10 });
    // fallback → quietStartHour=8, quietEndHour=22
    expect(config.quietStartHour).toBe(8);
    expect(config.quietEndHour).toBe(22);

    const sessions = [mk('2026-06-27', 1_200_001)]; // at-risk streak
    const { candidates } = planNotifications({
      sessions,
      now: NOW_UTC,
      tzOffsetMinutes: 0,
      config,
    });
    // streak-risk at hour 21 is inside [8,22) → should survive
    expect(candidates.find((c) => c.type === 'streak-risk')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// resolveNotificationConfig — partial prefs (sparse output)
// ---------------------------------------------------------------------------

describe('resolveNotificationConfig — partial prefs leave unspecified fields at defaults', () => {
  it('supplying only quietStartHour omits all other config fields', () => {
    const config = resolveNotificationConfig({ quietStartHour: 10 });
    expect(config.quietStartHour).toBe(10);
    expect(config.quietEndHour).toBeUndefined();
    expect(config.enabledTypes).toBeUndefined();
    expect((config as Partial<NotificationConfig>).goalTargetMs).toBeUndefined();
  });

  it('supplying only enabledTypes omits quiet-hour fields', () => {
    const allEnabled = Object.fromEntries(
      NOTIFICATION_TYPES.map((t) => [t, true]),
    ) as Record<NotificationType, boolean>;
    const config = resolveNotificationConfig({ enabledTypes: allEnabled });
    expect(config.enabledTypes).toBeDefined();
    expect(config.quietStartHour).toBeUndefined();
    expect(config.quietEndHour).toBeUndefined();
  });

  it('unspecified fields use DEFAULT_NOTIFICATION_CONFIG when spread', () => {
    // Verify that planNotifications with only quietEndHour=20 still uses other defaults
    const config = resolveNotificationConfig({ quietEndHour: 20 });
    const sessions = [mk('2026-06-27', 1_200_001)]; // at-risk streak (streakRiskHour=21)
    const { candidates } = planNotifications({
      sessions,
      now: NOW_UTC,
      tzOffsetMinutes: 0,
      config,
    });
    // streakRiskHour=21 is now outside [8,20) → dropped
    expect(candidates.find((c) => c.type === 'streak-risk')).toBeUndefined();
    // best-time at defaultBestHour=20 is outside [8,20) → dropped too
    expect(candidates.find((c) => c.type === 'best-time')).toBeUndefined();
  });
});
