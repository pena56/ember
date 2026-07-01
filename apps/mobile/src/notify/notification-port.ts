/**
 * notification-port.ts — RN-free NotificationPort interface.
 *
 * Lives in its own module so the node-tested runNotificationSync can
 * depend on the type without transitively importing react-native.
 * Platform is 'ios' | 'android' — the 16b registerDevice validator
 * accepts ios | android | web.
 */

/**
 * A single registered device as returned by getNotificationState (17g widening).
 * Exported so use-primary-device and device-picker-rows can share the type.
 */
export interface NotificationStateDevice {
  deviceId: string;
  platform: 'ios' | 'android' | 'web';
  hasToken: boolean;
  lastSeenAt: number;
  isPrimary: boolean;
}

export interface NotificationPort {
  registerDevice(args: { deviceId: string; platform: 'ios' | 'android'; expoPushToken?: string }): Promise<unknown>;
  submitIntent(args: {
    deviceId: string;
    dedupeKey: string;
    type: string;
    localDay: string;
    scheduledWall: number;
    title: string;
    body: string;
  }): Promise<unknown>;
  claimSlot(args: { dedupeKey: string; deviceId: string; via: 'suppressed' }): Promise<unknown>;
  /**
   * Read the owner's notification registration state. Used by the settings UI to
   * reconcile whether THIS device currently has a push token registered — the
   * durable answer that survives a screen remount (local optimistic state does
   * not). Exposes hasToken, never the raw token (16b getNotificationState).
   * Widened in 17g to include platform / lastSeenAt / isPrimary per device.
   */
  getNotificationState(): Promise<{
    devices: NotificationStateDevice[];
  }>;
  /**
   * Designates the owner's primary push device. The server enforces exactly-one-primary
   * per owner — all other devices have their isPrimary flag cleared atomically (17g).
   */
  setPrimaryDevice(args: { deviceId: string }): Promise<unknown>;
}
