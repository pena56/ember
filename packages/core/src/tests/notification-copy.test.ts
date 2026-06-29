/**
 * notification-copy.test.ts — pure copy map for notification types.
 *
 * Asserts:
 *  (1) each of the four NotificationTypes returns a distinct non-empty title and body
 *  (2) the switch is exhaustive (TypeScript compile-time; runtime: no type goes unmatched)
 */

import { describe, expect, it } from 'vitest';

import { notificationCopy } from '../notification-copy.js';
import type { NotificationType } from '../notification.js';
import { NOTIFICATION_PRIORITY } from '../notification.js';


// Derive the full list of types from NOTIFICATION_PRIORITY (same source deriveNotificationSync uses)
const ALL_TYPES = Object.keys(NOTIFICATION_PRIORITY) as NotificationType[];

describe('notificationCopy', () => {
  it('(1) returns non-empty title and body for each NotificationType', () => {
    for (const type of ALL_TYPES) {
      const copy = notificationCopy(type);
      expect(copy.title, `title for ${type}`).toBeTruthy();
      expect(copy.body, `body for ${type}`).toBeTruthy();
      expect(typeof copy.title, `title type for ${type}`).toBe('string');
      expect(typeof copy.body, `body type for ${type}`).toBe('string');
    }
  });

  it('(2) each type returns a distinct title', () => {
    const titles = ALL_TYPES.map((t) => notificationCopy(t).title);
    const unique = new Set(titles);
    expect(unique.size).toBe(ALL_TYPES.length);
  });

  it('(3) each type returns a distinct body', () => {
    const bodies = ALL_TYPES.map((t) => notificationCopy(t).body);
    const unique = new Set(bodies);
    expect(unique.size).toBe(ALL_TYPES.length);
  });

  it('(4) streak-risk copy is warm and mentions streak', () => {
    const copy = notificationCopy('streak-risk');
    expect(copy.title).toBe("Your streak's still warm");
    expect(copy.body).toBe('A few minutes tonight keeps it glowing.');
  });

  it('(5) goal-progress copy matches spec', () => {
    const copy = notificationCopy('goal-progress');
    expect(copy.title).toBe("You're almost there");
    expect(copy.body).toBe("A little more reading finishes today's goal.");
  });

  it('(6) best-time copy matches spec', () => {
    const copy = notificationCopy('best-time');
    expect(copy.title).toBe('Your reading hour');
    expect(copy.body).toBe('This is usually when you read — pick up where you left off?');
  });

  it('(7) lapse-reengage copy matches spec', () => {
    const copy = notificationCopy('lapse-reengage');
    expect(copy.title).toBe('Your books are waiting');
    expect(copy.body).toBe("It's been a while. A page or two is a fine place to start.");
  });
});
