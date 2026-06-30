/**
 * convex-notification-port.ts — Convex-backed NotificationPort adapter.
 *
 * Verbatim mirror of web's convex-notification-port.ts, but importing
 * NotificationPort from ./notification-port.js (not from the hook) and
 * using @ember/convex/_generated/api (the path mobile's convex-sync-transport.ts uses).
 *
 * This file is ONLY lazily imported by use-notification-sync.ts when no port
 * is injected — tests that inject a port never touch this file, so they are
 * not affected by the Convex singleton.
 */

import type { ConvexReactClient } from 'convex/react';

import { api } from '@ember/convex/_generated/api';

import type { NotificationPort } from './notification-port.js';

export function createConvexNotificationPort(convex: ConvexReactClient): NotificationPort {
  return {
    registerDevice: (a) => convex.mutation(api.notifications.registerDevice, a),
    submitIntent: (a) => convex.mutation(api.notifications.submitIntent, a),
    claimSlot: (a) => convex.mutation(api.notifications.claimSlot, a),
    getNotificationState: () => convex.query(api.notifications.getNotificationState, {}),
  };
}
