/**
 * notification-copy.ts — pure copy map for notification messages.
 *
 * Warm, literary voice matching the app. Exhaustive switch over NotificationType
 * (no default branch → adding a type without copy fails typecheck).
 */

import type { NotificationType } from './notification.js';

export function notificationCopy(type: NotificationType): { title: string; body: string } {
  switch (type) {
    case 'streak-risk':
      return {
        title: "Your streak's still warm",
        body: 'A few minutes tonight keeps it glowing.',
      };
    case 'goal-progress':
      return {
        title: "You're almost there",
        body: "A little more reading finishes today's goal.",
      };
    case 'best-time':
      return {
        title: 'Your reading hour',
        body: 'This is usually when you read — pick up where you left off?',
      };
    case 'lapse-reengage':
      return {
        title: 'Your books are waiting',
        body: "It's been a while. A page or two is a fine place to start.",
      };
  }
}
