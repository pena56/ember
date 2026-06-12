import { describe, expect, it } from 'vitest';

import { createWebClock } from '../store/web-clock.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeStorage(): { getItem(k: string): string | null; setItem(k: string, v: string): void } {
  const store = new Map<string, string>();
  return {
    getItem(k: string) {
      return store.has(k) ? (store.get(k) as string) : null;
    },
    setItem(k: string, v: string) {
      store.set(k, v);
    },
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('createWebClock', () => {
  it('generates and persists a device id on first creation', () => {
    const storage = makeStorage();
    let counter = 0;
    const clock = createWebClock({
      storage,
      newId: () => `id-${++counter}`,
      now: () => 1000,
    });

    expect(clock.deviceId).toBe('id-1');
    expect(storage.getItem('ember-device-id')).toBe('id-1');
  });

  it('restores the same device id on a second construction over the same storage', () => {
    const storage = makeStorage();
    let counter = 0;
    createWebClock({ storage, newId: () => `id-${++counter}`, now: () => 1000 });
    const clock2 = createWebClock({ storage, newId: () => `id-${++counter}`, now: () => 2000 });

    // device id was already set; newId should not have been called again for device id
    expect(clock2.deviceId).toBe('id-1');
  });

  it('stamps are strictly increasing within the same ms (counter bumps)', () => {
    const storage = makeStorage();
    const now = () => 5000;
    const clock = createWebClock({ storage, newId: () => 'node-a', now });

    const s1 = clock.nextStamp();
    const s2 = clock.nextStamp();
    const s3 = clock.nextStamp();

    // wall stays the same; counter should increment
    expect(s1.wall).toBe(5000);
    expect(s2.counter).toBeGreaterThan(s1.counter);
    expect(s3.counter).toBeGreaterThan(s2.counter);
  });

  it('stamps advance when wall-clock moves forward', () => {
    const storage = makeStorage();
    let t = 1000;
    const clock = createWebClock({ storage, newId: () => 'node-a', now: () => t });

    const s1 = clock.nextStamp();

    t = 2000;
    const s2 = clock.nextStamp();

    expect(s2.wall).toBeGreaterThan(s1.wall);
    // counter resets to 0 when wall advances
    expect(s2.counter).toBe(0);
  });

  it('survives a simulated reload — second clock resumes where the first left off', () => {
    const storage = makeStorage();
    const t = 1000;

    const clock1 = createWebClock({ storage, newId: () => 'node-a', now: () => t });
    clock1.nextStamp(); // advance once
    const s2 = clock1.nextStamp();

    // "Reload" — create a new clock instance over the same storage (same now)
    const clock2 = createWebClock({ storage, newId: () => 'node-a', now: () => t });
    const s3 = clock2.nextStamp();

    // The resumed clock must stamp strictly after s2
    expect(s3.counter).toBeGreaterThan(s2.counter);
    expect(s3.wall).toBeGreaterThanOrEqual(s2.wall);
    // device id must be stable
    expect(clock2.deviceId).toBe(clock1.deviceId);
  });

  it('newOutboxId returns a fresh id each call', () => {
    const storage = makeStorage();
    let counter = 0;
    const clock = createWebClock({ storage, newId: () => `uid-${++counter}`, now: () => 1000 });

    // First call to newId goes to deviceId; subsequent go to newOutboxId
    const id1 = clock.newOutboxId();
    const id2 = clock.newOutboxId();
    expect(id1).not.toBe(id2);
  });

  it('now() returns the injected time', () => {
    const storage = makeStorage();
    let t = 9999;
    const clock = createWebClock({ storage, now: () => t, newId: () => 'n' });
    expect(clock.now()).toBe(9999);
    t = 10_000;
    expect(clock.now()).toBe(10_000);
  });

  it('newId() uses the injected generator and returns distinct values', () => {
    const storage = makeStorage();
    let counter = 0;
    const clock = createWebClock({ storage, newId: () => `uid-${++counter}`, now: () => 1000 });

    // First call to newId went to deviceId; subsequent calls go to newId()
    const id1 = clock.newId();
    const id2 = clock.newId();
    expect(id1).not.toBe(id2);
    // Both must come from the injected generator
    expect(id1).toMatch(/^uid-\d+$/);
    expect(id2).toMatch(/^uid-\d+$/);
  });

  it('newId() and newOutboxId() draw from the same injected generator but are distinct methods', () => {
    const storage = makeStorage();
    const generated: string[] = [];
    const clock = createWebClock({
      storage,
      newId: () => {
        const id = `gen-${generated.length.toString()}`;
        generated.push(id);
        return id;
      },
      now: () => 1000,
    });

    const sessionId = clock.newId();
    const outboxId = clock.newOutboxId();

    expect(sessionId).not.toBe(outboxId); // distinct values
    expect(generated.length).toBeGreaterThanOrEqual(2); // both called the generator
  });

  it('newId() does not perturb the HLC clock (stamps stay monotonic)', () => {
    const storage = makeStorage();
    let counter = 0;
    const clock = createWebClock({ storage, newId: () => `uid-${++counter}`, now: () => 5000 });

    const s1 = clock.nextStamp();
    clock.newId(); // must not affect clock state
    const s2 = clock.nextStamp();

    expect(s2.counter).toBeGreaterThan(s1.counter);
  });
});
