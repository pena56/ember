// notification-preferences.test.ts — tests for getNotificationPreferences / setNotificationPreferences.
// Uses MemoryRepository + fixed Hlc (mirrors goal-config.test.ts pattern).

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  encode,
  initialClock,
  tick,
} from '@ember/core';

import { MemoryRepository } from '../memory-repository.js';
import {
  NOTIFICATION_PREFERENCES_COLLECTION,
  NOTIFICATION_PREFERENCES_ID,
  getNotificationPreferences,
  setNotificationPreferences,
} from '../notification-preferences.js';

// ---------------------------------------------------------------------------
// Test harness (mirrors goal-config.test.ts)
// ---------------------------------------------------------------------------

function makeTestDeps() {
  const repo = new MemoryRepository();
  const hlc = tick(initialClock('test-node'), 1_000_000);
  let outboxCounter = 0;
  const newOutboxId = () => `outbox-${++outboxCounter}`;
  return { repo, hlc, newOutboxId };
}

// ---------------------------------------------------------------------------
// getNotificationPreferences — default when nothing stored
// ---------------------------------------------------------------------------

describe('getNotificationPreferences — default', () => {
  it('returns DEFAULT_NOTIFICATION_PREFERENCES and empty updatedAt when nothing stored', async () => {
    const { repo } = makeTestDeps();
    const result = await getNotificationPreferences(repo);
    expect(result.id).toBe(NOTIFICATION_PREFERENCES_ID);
    expect(result.prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(result.updatedAt).toBe('');
  });
});

// ---------------------------------------------------------------------------
// setNotificationPreferences — writes one record + one outbox entry
// ---------------------------------------------------------------------------

describe('setNotificationPreferences', () => {
  it('writes exactly one record (id "default") + exactly one outbox entry (op put, recordId "default")', async () => {
    const deps = makeTestDeps();
    const prefs = { ...DEFAULT_NOTIFICATION_PREFERENCES };

    const record = await setNotificationPreferences(deps, prefs);

    // Record shape
    expect(record.id).toBe(NOTIFICATION_PREFERENCES_ID);
    expect(record.prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(record.updatedAt).toBe(encode(deps.hlc));

    // One record stored
    const stored = await deps.repo.get(NOTIFICATION_PREFERENCES_COLLECTION, NOTIFICATION_PREFERENCES_ID);
    expect(stored).toEqual(record);

    // Exactly one outbox entry
    const entries = await deps.repo.unacked();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.op).toBe('put');
    expect(entries[0]!.recordId).toBe(NOTIFICATION_PREFERENCES_ID);
    expect(entries[0]!.collection).toBe(NOTIFICATION_PREFERENCES_COLLECTION);
    expect(entries[0]!.payload).toEqual(record);
  });

  it('getNotificationPreferences after set returns the stored value', async () => {
    const deps = makeTestDeps();
    const prefs = { ...DEFAULT_NOTIFICATION_PREFERENCES, quietStartHour: 9 };

    await setNotificationPreferences(deps, prefs);
    const result = await getNotificationPreferences(deps.repo);

    expect(result.id).toBe(NOTIFICATION_PREFERENCES_ID);
    expect(result.prefs.quietStartHour).toBe(9);
  });

  it('set twice → still single notificationPreferences record (overwritten), two outbox entries', async () => {
    const deps = makeTestDeps();

    await setNotificationPreferences(deps, { ...DEFAULT_NOTIFICATION_PREFERENCES, quietStartHour: 7 });
    await setNotificationPreferences(deps, { ...DEFAULT_NOTIFICATION_PREFERENCES, quietStartHour: 10 });

    // Only one record in the collection
    const allRecords = await deps.repo.query(NOTIFICATION_PREFERENCES_COLLECTION);
    expect(allRecords).toHaveLength(1);
    expect((allRecords[0] as unknown as { prefs: { quietStartHour: number } }).prefs.quietStartHour).toBe(10);

    // Two outbox entries (mutation log — append only)
    const entries = await deps.repo.unacked();
    expect(entries).toHaveLength(2);
  });

  it('updatedAt equals encode(hlc), non-empty, sorts above empty string', async () => {
    const deps = makeTestDeps();
    const record = await setNotificationPreferences(deps, { ...DEFAULT_NOTIFICATION_PREFERENCES });
    expect(record.updatedAt).toBe(encode(deps.hlc));
    expect(record.updatedAt.length).toBeGreaterThan(0);
    expect(record.updatedAt > '').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// normalizePrefs — fills missing enabledTypes keys + clamps quiet hours
// ---------------------------------------------------------------------------

describe('normalizePrefs (via setNotificationPreferences)', () => {
  it('fills a missing enabledTypes key from the default', async () => {
    const deps = makeTestDeps();
    // Supply prefs with an incomplete enabledTypes (missing keys)
    const partialPrefs = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      enabledTypes: {} as Record<string, boolean>,
    };
    const record = await setNotificationPreferences(
      deps,
      partialPrefs as typeof DEFAULT_NOTIFICATION_PREFERENCES,
    );
    // All keys from default must be present and true (defaults filled in)
    for (const key of Object.keys(DEFAULT_NOTIFICATION_PREFERENCES.enabledTypes)) {
      expect(record.prefs.enabledTypes[key as keyof typeof record.prefs.enabledTypes]).toBe(true);
    }
  });

  it('clamps fractional quietStartHour/quietEndHour to integer in [0, 24]', async () => {
    const deps = makeTestDeps();
    const record = await setNotificationPreferences(deps, {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      quietStartHour: 7.9,
      quietEndHour: 23.6,
    });
    expect(record.prefs.quietStartHour).toBe(7);
    expect(record.prefs.quietEndHour).toBe(23);
  });

  it('clamps out-of-range quietStartHour below 0 to 0', async () => {
    const deps = makeTestDeps();
    const record = await setNotificationPreferences(deps, {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      quietStartHour: -5,
    });
    expect(record.prefs.quietStartHour).toBe(0);
  });

  it('clamps out-of-range quietEndHour above 24 to 24', async () => {
    const deps = makeTestDeps();
    const record = await setNotificationPreferences(deps, {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      quietEndHour: 30,
    });
    expect(record.prefs.quietEndHour).toBe(24);
  });

  it('normalizePrefs on read: stored record with partial enabledTypes is normalized without changing updatedAt', async () => {
    const deps = makeTestDeps();
    // Write a full record first
    const written = await setNotificationPreferences(deps, { ...DEFAULT_NOTIFICATION_PREFERENCES });
    // Manually corrupt the stored record to have partial enabledTypes
    const storedRaw = {
      ...written,
      prefs: {
        ...written.prefs,
        enabledTypes: {} as Record<string, boolean>,
      },
    };
    await deps.repo.put(NOTIFICATION_PREFERENCES_COLLECTION, storedRaw);

    const read = await getNotificationPreferences(deps.repo);
    // All keys should be present after normalization
    for (const key of Object.keys(DEFAULT_NOTIFICATION_PREFERENCES.enabledTypes)) {
      expect(read.prefs.enabledTypes[key as keyof typeof read.prefs.enabledTypes]).toBe(true);
    }
    // updatedAt must NOT be changed on read
    expect(read.updatedAt).toBe(written.updatedAt);
    // No new outbox entries (read does not write)
    const entries = await deps.repo.unacked();
    expect(entries).toHaveLength(1); // only the original set
  });
});
