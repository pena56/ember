import { describe, expect, it } from 'vitest';

import { formatRelativeLastSeen } from './format-last-seen.js';

// ── Time constants (ms) ───────────────────────────────────────────────────────

const SEC = 1_000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// Arbitrary fixed "now" — large enough that subtracting days doesn't go negative.
const NOW = 1_700_000_000_000;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('formatRelativeLastSeen', () => {
  // "just now" — sub-60s and negative delta

  it('returns "Active just now" when delta is 0 (same instant)', () => {
    expect(formatRelativeLastSeen(NOW, NOW)).toBe('Active just now');
  });

  it('returns "Active just now" for delta < 60 s', () => {
    expect(formatRelativeLastSeen(NOW, NOW - 1)).toBe('Active just now');
    expect(formatRelativeLastSeen(NOW, NOW - 59 * SEC)).toBe('Active just now');
  });

  it('clamps negative delta (clock skew) to "Active just now"', () => {
    expect(formatRelativeLastSeen(NOW, NOW + SEC)).toBe('Active just now');
    expect(formatRelativeLastSeen(NOW, NOW + 10 * MIN)).toBe('Active just now');
  });

  // Minutes

  it('returns minutes at the exact 60 s boundary', () => {
    expect(formatRelativeLastSeen(NOW, NOW - 60 * SEC)).toBe('Active 1m ago');
  });

  it('returns minutes for deltas in the [1 min, 60 min) range', () => {
    expect(formatRelativeLastSeen(NOW, NOW - MIN)).toBe('Active 1m ago');
    expect(formatRelativeLastSeen(NOW, NOW - 5 * MIN)).toBe('Active 5m ago');
    expect(formatRelativeLastSeen(NOW, NOW - 59 * MIN)).toBe('Active 59m ago');
  });

  // Hours — including multi-unit floor (e.g. 90 min → 1h)

  it('returns hours at the exact 60 min boundary', () => {
    expect(formatRelativeLastSeen(NOW, NOW - 60 * MIN)).toBe('Active 1h ago');
  });

  it('floors 90 min to "Active 1h ago" (multi-unit floor)', () => {
    expect(formatRelativeLastSeen(NOW, NOW - 90 * MIN)).toBe('Active 1h ago');
  });

  it('returns hours for deltas in the [1 h, 24 h) range', () => {
    expect(formatRelativeLastSeen(NOW, NOW - HOUR)).toBe('Active 1h ago');
    expect(formatRelativeLastSeen(NOW, NOW - 3 * HOUR)).toBe('Active 3h ago');
    expect(formatRelativeLastSeen(NOW, NOW - 23 * HOUR)).toBe('Active 23h ago');
  });

  // Days

  it('returns days at the exact 24 h boundary', () => {
    expect(formatRelativeLastSeen(NOW, NOW - 24 * HOUR)).toBe('Active 1d ago');
  });

  it('returns days for deltas >= 24 h', () => {
    expect(formatRelativeLastSeen(NOW, NOW - DAY)).toBe('Active 1d ago');
    expect(formatRelativeLastSeen(NOW, NOW - 2 * DAY)).toBe('Active 2d ago');
    expect(formatRelativeLastSeen(NOW, NOW - 7 * DAY)).toBe('Active 7d ago');
  });

  it('floors 36 h to "Active 1d ago" (multi-unit floor into days)', () => {
    expect(formatRelativeLastSeen(NOW, NOW - 36 * HOUR)).toBe('Active 1d ago');
  });
});
