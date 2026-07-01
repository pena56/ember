/**
 * device-picker-rows.ts — pure ordering seam for the push-device picker.
 *
 * Decides the order in which registered devices are displayed in the Settings
 * "Push device" section. This is the ONLY place order/marking decisions live
 * (invariant #5 — hook and screen carry zero decision logic).
 *
 * Pure: RN-free, no clock, no side effects. Allocation-light: one filter + one
 * sort on typically ≤ 3 items.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single device as returned by the port's getNotificationState. */
interface InputDevice {
  deviceId: string;
  platform: 'ios' | 'android' | 'web';
  hasToken: boolean;
  lastSeenAt: number;
  isPrimary: boolean;
}

/**
 * An annotated, ordered device row ready to render in the DeviceSection.
 * Exported so settings-screen.tsx can type its props over this contract.
 */
export interface DevicePickerRow {
  deviceId: string;
  platform: 'ios' | 'android' | 'web';
  isPrimary: boolean;
  hasToken: boolean;
  /** Epoch-ms of last activity; the screen formats it via formatRelativeLastSeen. */
  lastSeenAt: number;
  /** True only when deviceId === the bundle's current device. */
  isCurrent: boolean;
}

interface DeriveArgs {
  devices: InputDevice[];
  currentDeviceId: string | null;
}

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Derive an ordered, annotated row list for the Settings device picker.
 *
 * Order:
 *  1. The current device (deviceId === currentDeviceId) always first.
 *  2. Remaining devices sorted by lastSeenAt descending.
 *  3. Tie-break: deviceId ascending (mirrors 17g's deterministic election
 *     tie-break so the UI order matches the server's implicit preference).
 *
 * `isCurrent` is set only for the matching device; `null` currentDeviceId
 * (unauthenticated / no bundle) means no row is ever flagged current.
 * `isPrimary` and `hasToken` are passed through unchanged.
 */
export function deriveDevicePickerRows({ devices, currentDeviceId }: DeriveArgs): DevicePickerRow[] {
  if (devices.length === 0) return [];

  const currentDevice =
    currentDeviceId !== null
      ? devices.find((d) => d.deviceId === currentDeviceId)
      : undefined;

  // Sort the non-current remainder by recency desc, tie-break id asc.
  const others = devices
    .filter((d) => d.deviceId !== currentDeviceId)
    .sort((a, b) => {
      if (b.lastSeenAt !== a.lastSeenAt) return b.lastSeenAt - a.lastSeenAt;
      // Stable, deterministic tie-break (mirrors 17g election).
      return a.deviceId < b.deviceId ? -1 : a.deviceId > b.deviceId ? 1 : 0;
    });

  const ordered: InputDevice[] = currentDevice ? [currentDevice, ...others] : others;

  return ordered.map((d) => ({
    deviceId: d.deviceId,
    platform: d.platform,
    isPrimary: d.isPrimary,
    hasToken: d.hasToken,
    lastSeenAt: d.lastSeenAt,
    isCurrent: d.deviceId === currentDeviceId,
  }));
}
