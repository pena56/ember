import { describe, expect, it } from 'vitest';

import { deriveDevicePickerRows } from './device-picker-rows.js';

// ── Shared fixture helpers ─────────────────────────────────────────────────────

const BASE: Omit<Parameters<typeof deriveDevicePickerRows>[0]['devices'][number], 'deviceId'> = {
  platform: 'ios',
  hasToken: true,
  lastSeenAt: 1_000,
  isPrimary: false,
};

function d(
  deviceId: string,
  overrides: Partial<typeof BASE> = {},
): Parameters<typeof deriveDevicePickerRows>[0]['devices'][number] {
  return { ...BASE, deviceId, ...overrides };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('deriveDevicePickerRows', () => {
  // Edge cases — empty / single

  it('returns [] for empty devices list', () => {
    expect(deriveDevicePickerRows({ devices: [], currentDeviceId: 'a' })).toEqual([]);
  });

  it('single device → one row flagged isCurrent', () => {
    const rows = deriveDevicePickerRows({ devices: [d('a')], currentDeviceId: 'a' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ deviceId: 'a', isCurrent: true });
  });

  it('single device + null currentDeviceId → row not flagged isCurrent', () => {
    const rows = deriveDevicePickerRows({ devices: [d('a')], currentDeviceId: null });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.isCurrent).toBe(false);
  });

  // Ordering

  it('current device sorts first even when another device has a newer lastSeenAt', () => {
    const rows = deriveDevicePickerRows({
      devices: [d('b', { lastSeenAt: 2_000 }), d('a', { lastSeenAt: 1_000 })],
      currentDeviceId: 'a',
    });
    expect(rows.map((r) => r.deviceId)).toEqual(['a', 'b']);
  });

  it('non-current devices order by lastSeenAt descending', () => {
    const rows = deriveDevicePickerRows({
      devices: [
        d('c', { lastSeenAt: 1_000 }),
        d('b', { lastSeenAt: 3_000 }),
        d('a', { lastSeenAt: 2_000 }),
      ],
      currentDeviceId: 'x', // not in list
    });
    expect(rows.map((r) => r.deviceId)).toEqual(['b', 'a', 'c']);
  });

  it('tie-break by deviceId ascending when lastSeenAt is equal', () => {
    const rows = deriveDevicePickerRows({
      devices: [
        d('c', { lastSeenAt: 1_000 }),
        d('a', { lastSeenAt: 1_000 }),
        d('b', { lastSeenAt: 1_000 }),
      ],
      currentDeviceId: 'x',
    });
    expect(rows.map((r) => r.deviceId)).toEqual(['a', 'b', 'c']);
  });

  it('current device is first; remaining sorted by lastSeenAt desc then id asc', () => {
    const rows = deriveDevicePickerRows({
      devices: [
        d('cur', { lastSeenAt: 500 }),
        d('c', { lastSeenAt: 1_000 }),
        d('b', { lastSeenAt: 1_000 }),
        d('a', { lastSeenAt: 2_000 }),
      ],
      currentDeviceId: 'cur',
    });
    expect(rows.map((r) => r.deviceId)).toEqual(['cur', 'a', 'b', 'c']);
  });

  // isCurrent flagging

  it('isCurrent is true only for the matching currentDeviceId', () => {
    const rows = deriveDevicePickerRows({
      devices: [d('a'), d('b')],
      currentDeviceId: 'a',
    });
    const rowA = rows.find((r) => r.deviceId === 'a');
    const rowB = rows.find((r) => r.deviceId === 'b');
    expect(rowA?.isCurrent).toBe(true);
    expect(rowB?.isCurrent).toBe(false);
  });

  it('currentDeviceId null → no row is flagged isCurrent', () => {
    const rows = deriveDevicePickerRows({
      devices: [d('a'), d('b')],
      currentDeviceId: null,
    });
    expect(rows.every((r) => !r.isCurrent)).toBe(true);
  });

  it('currentDeviceId not in devices → no row is flagged isCurrent', () => {
    const rows = deriveDevicePickerRows({
      devices: [d('a'), d('b')],
      currentDeviceId: 'z',
    });
    expect(rows.every((r) => !r.isCurrent)).toBe(true);
  });

  // Pass-through of isPrimary and hasToken

  it('passes isPrimary and hasToken through unchanged', () => {
    const rows = deriveDevicePickerRows({
      devices: [
        d('a', { isPrimary: true, hasToken: false }),
        d('b', { isPrimary: false, hasToken: true }),
      ],
      currentDeviceId: 'a',
    });
    expect(rows[0]).toMatchObject({ deviceId: 'a', isPrimary: true, hasToken: false });
    expect(rows[1]).toMatchObject({ deviceId: 'b', isPrimary: false, hasToken: true });
  });

  it('passes lastSeenAt through unchanged (the screen formats it)', () => {
    const rows = deriveDevicePickerRows({
      devices: [d('a', { lastSeenAt: 4_242 })],
      currentDeviceId: 'a',
    });
    expect(rows[0]?.lastSeenAt).toBe(4_242);
  });

  // Platform pass-through

  it('passes platform through unchanged', () => {
    const rows = deriveDevicePickerRows({
      devices: [d('a', { platform: 'android' }), d('b', { platform: 'web' })],
      currentDeviceId: 'a',
    });
    expect(rows[0]?.platform).toBe('android');
    expect(rows[1]?.platform).toBe('web');
  });
});
