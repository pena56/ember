import { encode, initialClock, parse, tick } from '@ember/core';
import type { Hlc } from '@ember/core';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface WebClock {
  deviceId: string;
  /** Advance the clock, persist it, and return the new stamp. */
  nextStamp(): Hlc;
  /** Returns a fresh unique id for session records (distinct from outbox ids). */
  newId(): string;
  /** Returns a fresh unique id for outbox entries. */
  newOutboxId(): string;
  /** Returns current wall-clock time in ms. */
  now(): number;
}

// ── Storage keys ──────────────────────────────────────────────────────────────

const DEVICE_ID_KEY = 'ember-device-id';
const HLC_KEY = 'ember-hlc';

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a persisted HLC clock + device identity for the web client.
 *
 * All dependencies are injectable so this function is fully testable in a
 * pure-JS environment without touching localStorage or crypto.randomUUID.
 *
 * - Device id: loaded from storage on first call; generated and persisted if absent.
 * - Clock: loaded (decoded) from storage; falls back to `initialClock(deviceId)`.
 *   The counter is restored so the clock is strictly monotonic across page reloads.
 */
export function createWebClock(deps?: {
  storage?: StorageLike;
  now?: () => number;
  newId?: () => string;
}): WebClock {
  const storage = deps?.storage ?? localStorage;
  const nowFn = deps?.now ?? (() => Date.now());
  const newId = deps?.newId ?? (() => crypto.randomUUID());

  // Stable device id
  let deviceId = storage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = newId();
    storage.setItem(DEVICE_ID_KEY, deviceId);
  }

  // Restore or initialise the HLC clock
  const stored = storage.getItem(HLC_KEY);
  let clock: Hlc = stored ? parse(stored) : initialClock(deviceId);

  return {
    deviceId,

    nextStamp(): Hlc {
      clock = tick(clock, nowFn());
      storage.setItem(HLC_KEY, encode(clock));
      return clock;
    },

    newId(): string {
      return newId();
    },

    newOutboxId(): string {
      return newId();
    },

    now(): number {
      return nowFn();
    },
  };
}
