// packages/core — shared domain logic (no platform APIs)

export const CORE_VERSION = '0.0.1';

export * from './hlc.js';
export * from './outbox.js';
export * from './document.js';
export * from './text-geometry.js';
export * from './reading-position.js';
export * from './session.js';
export * from './streak.js';
export * from './analytics.js';
export * from './annotation.js';
export * from './anchor-resolver.js';
export * from './sync-transport.js';
export * from './apply-pull.js';
export * from './reconcile.js';
export * from './blob-sync.js';
export * from './duplicate-detection.js';
export * from './duplicate-decision.js';
export * from './conflict-policy.js';
export * from './claim-merge.js';
export * from './tag.js';
export * from './doc-tag.js';
export * from './smart-view.js';
export * from './notification.js';
export * from './notification-copy.js';
export * from './notification-sync.js';
export * from './notification-preferences.js';
