import { describe, expect, it } from 'vitest';

// Import from the pure helper (no React Native dep) so vitest's node
// environment can parse and run the tests without Flow-typed modules.
import { formatHour } from './format-hour.js';

describe('formatHour', () => {
  it('renders midnight for hour 0', () => {
    expect(formatHour(0)).toBe('12:00 AM');
  });

  it('renders AM hours correctly', () => {
    expect(formatHour(1)).toBe('1:00 AM');
    expect(formatHour(8)).toBe('8:00 AM');
    expect(formatHour(11)).toBe('11:00 AM');
  });

  it('renders noon correctly', () => {
    expect(formatHour(12)).toBe('12:00 PM');
  });

  it('renders PM hours correctly', () => {
    expect(formatHour(13)).toBe('1:00 PM');
    expect(formatHour(17)).toBe('5:00 PM');
    expect(formatHour(22)).toBe('10:00 PM');
    expect(formatHour(23)).toBe('11:00 PM');
  });

  it('renders Midnight for end-of-day sentinel 24', () => {
    expect(formatHour(24)).toBe('Midnight');
  });
});
