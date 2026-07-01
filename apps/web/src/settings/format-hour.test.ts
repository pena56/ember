/**
 * format-hour.test.ts — branch coverage for the pure formatHour helper.
 *
 * Covers the five branch points called out in the 17e spec:
 *   0 (midnight-AM) / AM range / noon / PM range / 24 (Midnight sentinel).
 */

import { describe, expect, it } from 'vitest';

import { formatHour } from './format-hour.js';

describe('formatHour', () => {
  it('0 → "12:00 AM"', () => {
    expect(formatHour(0)).toBe('12:00 AM');
  });

  it('AM range: 8 → "8:00 AM"', () => {
    expect(formatHour(8)).toBe('8:00 AM');
  });

  it('AM boundary: 1 → "1:00 AM"', () => {
    expect(formatHour(1)).toBe('1:00 AM');
  });

  it('AM upper boundary: 11 → "11:00 AM"', () => {
    expect(formatHour(11)).toBe('11:00 AM');
  });

  it('noon: 12 → "12:00 PM"', () => {
    expect(formatHour(12)).toBe('12:00 PM');
  });

  it('PM range: 22 → "10:00 PM"', () => {
    expect(formatHour(22)).toBe('10:00 PM');
  });

  it('PM: 13 → "1:00 PM"', () => {
    expect(formatHour(13)).toBe('1:00 PM');
  });

  it('PM: 23 → "11:00 PM"', () => {
    expect(formatHour(23)).toBe('11:00 PM');
  });

  it('24 → "Midnight"', () => {
    expect(formatHour(24)).toBe('Midnight');
  });
});
