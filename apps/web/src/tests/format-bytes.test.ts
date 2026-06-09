import { describe, expect, it } from 'vitest';

import { formatBytes } from '../store/format-bytes.js';

describe('formatBytes', () => {
  it('returns 0 B for zero', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats bytes below 1000', () => {
    expect(formatBytes(1)).toBe('1 B');
    expect(formatBytes(999)).toBe('999 B');
  });

  it('formats kilobytes at 1000 boundary', () => {
    expect(formatBytes(1000)).toBe('1.0 KB');
    expect(formatBytes(1500)).toBe('1.5 KB');
    expect(formatBytes(999_999)).toBe('1000.0 KB');
  });

  it('formats megabytes at 1_000_000 boundary', () => {
    expect(formatBytes(1_000_000)).toBe('1.0 MB');
    expect(formatBytes(2_500_000)).toBe('2.5 MB');
    expect(formatBytes(10_000_000)).toBe('10.0 MB');
  });
});
