import { describe, expect, it } from 'vitest';

import { formatBytes } from '../store/format-bytes.js';

describe('formatBytes', () => {
  it('returns bytes for values under 1000', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1)).toBe('1 B');
    expect(formatBytes(999)).toBe('999 B');
  });

  it('returns KB for values from 1000 to 999 999', () => {
    expect(formatBytes(1000)).toBe('1.0 KB');
    expect(formatBytes(1500)).toBe('1.5 KB');
    expect(formatBytes(999_999)).toBe('1000.0 KB');
  });

  it('returns MB for values 1 000 000 and above', () => {
    expect(formatBytes(1_000_000)).toBe('1.0 MB');
    expect(formatBytes(2_500_000)).toBe('2.5 MB');
    expect(formatBytes(10_000_000)).toBe('10.0 MB');
  });
});
