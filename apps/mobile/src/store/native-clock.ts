import { encode, initialClock, parse, tick } from '@ember/core';
import type { Hlc } from '@ember/core';

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Sync key-value storage interface. Matches expo-sqlite/kv-store's *Sync methods.
 * Injectable so tests can use a plain in-memory map without any native dep.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The sync subset of expo-sqlite/kv-store's default Storage instance we rely on. */
interface KvStore {
  getItemSync(key: string): string | null;
  setItemSync(key: string, value: string): void;
}

export interface NativeClock {
  deviceId: string;
  /** Advance the clock, persist it, and return the new HLC stamp. */
  nextStamp(): Hlc;
  /** Returns a fresh unique id suitable for session records. */
  newId(): string;
  /** Returns a fresh unique id suitable for outbox entries. */
  newOutboxId(): string;
  /** Returns current wall-clock time in ms. */
  now(): number;
}

// ── Storage keys ──────────────────────────────────────────────────────────────

const DEVICE_ID_KEY = 'ember-device-id';
const HLC_KEY = 'ember-hlc';

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a persisted HLC clock + device identity for the native (mobile) client.
 *
 * Mirrors apps/web/src/store/web-clock.ts but targets expo-sqlite/kv-store as the
 * default storage (settled decision; the theme provider already uses its *Sync API).
 * Hoisting the shared HLC-clock logic into @ember/store is deferred to a future unit.
 *
 * All dependencies are injectable so this function is fully testable in a pure-JS
 * environment without touching kv-store or expo-crypto.
 *
 * - Device id: read from storage on first call; generated and persisted if absent.
 * - Clock: loaded (decoded) from storage; falls back to `initialClock(deviceId)`.
 *   The counter is restored so the clock is strictly monotonic across app reloads.
 */
export function createNativeClock(deps?: {
  storage?: StorageLike;
  now?: () => number;
  newId?: () => string;
}): NativeClock {
  // Production default: expo-sqlite/kv-store (lazy require to avoid Metro hoisting
  // the native module into headless test runs — the dep is only touched when no
  // storage override is provided, i.e. in native production builds).
  const storage: StorageLike =
    deps?.storage ??
    (() => {
      // kv-store exposes getItemSync/setItemSync as methods on its *default* instance
      // (the same one the theme provider imports as `Storage`), NOT as top-level named
      // exports — so reach through `.default`/`.Storage` rather than the module object.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('expo-sqlite/kv-store') as {
        default?: KvStore;
        Storage?: KvStore;
      } & Partial<KvStore>;
      const kv = mod.default ?? mod.Storage ?? (mod as KvStore);
      return {
        getItem: (k) => kv.getItemSync(k),
        setItem: (k, v) => { kv.setItemSync(k, v); },
      };
    })();
  const nowFn = deps?.now ?? (() => Date.now());
  const newId =
    deps?.newId ??
    (() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Crypto = require('expo-crypto') as { randomUUID: () => string };
      return Crypto.randomUUID();
    });

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
