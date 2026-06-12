import { describe, expect, it } from 'vitest';

import { createNativeClock } from '../store/native-clock.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStorage(): { getItem(k: string): string | null; setItem(k: string, v: string): void } {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); },
  };
}

let idCounter = 0;
function fakeNewId() {
  idCounter++;
  return `id-${idCounter.toString()}`;
}

describe('createNativeClock', () => {
  it('generates and persists a device id', () => {
    const storage = makeStorage();
    idCounter = 0;
    const clock = createNativeClock({ storage, now: () => 1000, newId: fakeNewId });
    expect(clock.deviceId).toBe('id-1');
    // reading again returns same device id
    const clock2 = createNativeClock({ storage, now: () => 1000, newId: fakeNewId });
    expect(clock2.deviceId).toBe('id-1');
  });

  it('stamps are strictly monotonic within the same millisecond', () => {
    const storage = makeStorage();
    idCounter = 0;
    const clock = createNativeClock({ storage, now: () => 1000, newId: fakeNewId });
    const s1 = clock.nextStamp();
    const s2 = clock.nextStamp();
    const s3 = clock.nextStamp();
    // wall-clock is the same ms — counter must advance
    expect(s2.counter).toBeGreaterThan(s1.counter);
    expect(s3.counter).toBeGreaterThan(s2.counter);
  });

  it('stamps advance when wall clock advances', () => {
    const storage = makeStorage();
    idCounter = 0;
    let now = 1000;
    const clock = createNativeClock({ storage, now: () => now, newId: fakeNewId });
    const s1 = clock.nextStamp();
    now = 2000;
    const s2 = clock.nextStamp();
    // wall-time advanced — wall portion of s2 > s1
    expect(s2.wall).toBeGreaterThan(s1.wall);
  });

  it('resumes the persisted clock on a second createNativeClock call (monotonic across reload)', () => {
    const storage = makeStorage();
    idCounter = 0;
    const nowRef = { value: 1000 };
    const clock1 = createNativeClock({ storage, now: () => nowRef.value, newId: fakeNewId });
    const s1 = clock1.nextStamp();
    const s2 = clock1.nextStamp();

    // Simulate a reload: same storage, same wall time
    const clock2 = createNativeClock({ storage, now: () => nowRef.value, newId: fakeNewId });
    const s3 = clock2.nextStamp();

    // s3 must be strictly after s2 even though wall time didn't advance
    if (s3.wall === s2.wall) {
      expect(s3.counter).toBeGreaterThan(s2.counter);
    } else {
      expect(s3.wall).toBeGreaterThan(s2.wall);
    }

    void s1; // used for ordering
  });

  it('newOutboxId returns a unique id each call', () => {
    const storage = makeStorage();
    idCounter = 0;
    const clock = createNativeClock({ storage, now: () => 1000, newId: fakeNewId });
    const a = clock.newOutboxId();
    const b = clock.newOutboxId();
    expect(a).not.toBe(b);
  });

  it('now() delegates to the injected now function', () => {
    const storage = makeStorage();
    idCounter = 0;
    const clock = createNativeClock({ storage, now: () => 42_000, newId: fakeNewId });
    expect(clock.now()).toBe(42_000);
  });

  it('newId() returns the injected generator value', () => {
    const storage = makeStorage();
    idCounter = 0;
    const clock = createNativeClock({ storage, now: () => 1000, newId: fakeNewId });
    // The first call to newId was consumed to generate the device id,
    // so subsequent calls return the next values.
    const a = clock.newId();
    const b = clock.newId();
    expect(typeof a).toBe('string');
    expect(typeof b).toBe('string');
    expect(a).not.toBe(b);
  });

  it('newId() does not perturb the HLC clock (nextStamp unaffected by newId calls)', () => {
    const storage = makeStorage();
    idCounter = 0;
    const clock = createNativeClock({ storage, now: () => 1000, newId: fakeNewId });
    const s1 = clock.nextStamp();
    // Call newId several times between stamps
    clock.newId();
    clock.newId();
    clock.newId();
    const s2 = clock.nextStamp();
    // s2 must be strictly after s1 (counter or wall advances)
    if (s2.wall === s1.wall) {
      expect(s2.counter).toBeGreaterThan(s1.counter);
    } else {
      expect(s2.wall).toBeGreaterThan(s1.wall);
    }
  });
});
