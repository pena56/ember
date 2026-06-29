/**
 * notification-port.ts — RN-free NotificationPort interface.
 *
 * Lives in its own module so the node-tested runNotificationSync can
 * depend on the type without transitively importing react-native.
 * Platform is 'ios' | 'android' — the 16b registerDevice validator
 * accepts ios | android | web.
 */

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
}
