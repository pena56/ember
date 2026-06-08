import { describe, expect, it } from 'vitest';

import { resolveAppTheme } from '../theme/resolve-app-theme.js';

describe('resolveAppTheme', () => {
  it('system + dark → warm-dark', () => {
    expect(resolveAppTheme('system', true)).toBe('warm-dark');
  });

  it('system + light → warm-light', () => {
    expect(resolveAppTheme('system', false)).toBe('warm-light');
  });

  it('explicit warm-dark passes through regardless of system', () => {
    expect(resolveAppTheme('warm-dark', false)).toBe('warm-dark');
    expect(resolveAppTheme('warm-dark', true)).toBe('warm-dark');
  });

  it('explicit warm-light passes through regardless of system', () => {
    expect(resolveAppTheme('warm-light', true)).toBe('warm-light');
    expect(resolveAppTheme('warm-light', false)).toBe('warm-light');
  });
});
