/**
 * web-store-notification-preferences.test.ts — store-surface coverage for
 * getNotificationPreferences / setNotificationPreferences on the WebStore facade.
 *
 * These are thin pass-throughs over the already-tested 17c layer; the tests here
 * confirm the plumbing (WebStore correctly delegates to @ember/store with the right
 * clock/repo) rather than re-testing the core logic.
 *
 * Three cases:
 *  1. get-default — no prior set → returns default prefs with updatedAt ''
 *  2. set-persists — after set, get reads back the same prefs
 *  3. exactly-one-outbox-entry-per-set — each set call produces exactly one new entry
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_NOTIFICATION_PREFERENCES } from '@ember/core';
import { MemoryBlobStore, MemoryRepository, NOTIFICATION_PREFERENCES_COLLECTION } from '@ember/store';

import { subtleCryptoHasher } from '../store/subtle-crypto-hasher.js';
import { createWebClock } from '../store/web-clock.js';
import { createWebStore } from '../store/web-store.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
  };
}

function makeWebStore() {
  let counter = 0;
  const repo = new MemoryRepository();
  const store = createWebStore({
    repo,
    blobs: new MemoryBlobStore(),
    hasher: subtleCryptoHasher,
    clock: createWebClock({
      storage: makeStorage(),
      now: () => 1_000_000,
      newId: () => `id-${(++counter).toString()}`,
    }),
  });
  return { store, repo };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WebStore notification-preferences surface', () => {
  it('get-default: returns default prefs with empty updatedAt when nothing stored', async () => {
    const { store } = makeWebStore();

    const record = await store.getNotificationPreferences();

    // Default record sentinel — not yet persisted
    expect(record.updatedAt).toBe('');
    expect(record.prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(record.prefs.quietStartHour).toBe(DEFAULT_NOTIFICATION_PREFERENCES.quietStartHour);
    expect(record.prefs.quietEndHour).toBe(DEFAULT_NOTIFICATION_PREFERENCES.quietEndHour);
  });

  it('set-persists: after setNotificationPreferences, get reads back the updated prefs', async () => {
    const { store } = makeWebStore();

    const next = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      quietStartHour: 10,
      quietEndHour: 21,
      enabledTypes: { ...DEFAULT_NOTIFICATION_PREFERENCES.enabledTypes, 'streak-risk': false },
    };

    const setResult = await store.setNotificationPreferences(next);

    // set returns the persisted record with a non-empty HLC stamp
    expect(setResult.updatedAt).not.toBe('');
    expect(setResult.prefs.quietStartHour).toBe(10);
    expect(setResult.prefs.quietEndHour).toBe(21);
    expect(setResult.prefs.enabledTypes['streak-risk']).toBe(false);

    // get reads it back from the repo
    const got = await store.getNotificationPreferences();
    expect(got.updatedAt).toBe(setResult.updatedAt);
    expect(got.prefs.quietStartHour).toBe(10);
    expect(got.prefs.quietEndHour).toBe(21);
    expect(got.prefs.enabledTypes['streak-risk']).toBe(false);
  });

  it('exactly-one-outbox-entry-per-set: each set call enqueues exactly one outbox entry', async () => {
    const { store, repo } = makeWebStore();

    // No outbox entries before any set
    const outboxBefore = await repo.unacked();
    expect(outboxBefore).toHaveLength(0);

    // First set
    await store.setNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES);
    const outboxAfterFirst = await repo.unacked();
    expect(outboxAfterFirst).toHaveLength(1);
    expect(outboxAfterFirst[0]).toMatchObject({
      collection: NOTIFICATION_PREFERENCES_COLLECTION,
      op: 'put',
    });

    // Second set with different prefs → exactly one NEW entry (total: 2)
    await store.setNotificationPreferences({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      quietStartHour: 9,
    });
    const outboxAfterSecond = await repo.unacked();
    expect(outboxAfterSecond).toHaveLength(2);
  });
});
