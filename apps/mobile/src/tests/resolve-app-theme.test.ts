import { describe, expect, it } from 'vitest';

import { coerceStoredPreference } from '../theme/resolve-app-theme.js';

describe('coerceStoredPreference', () => {
  it('passes through valid "system"', () => {
    expect(coerceStoredPreference('system')).toBe('system');
  });

  it('passes through valid "warm-light"', () => {
    expect(coerceStoredPreference('warm-light')).toBe('warm-light');
  });

  it('passes through valid "warm-dark"', () => {
    expect(coerceStoredPreference('warm-dark')).toBe('warm-dark');
  });

  it('returns "system" for null', () => {
    expect(coerceStoredPreference(null)).toBe('system');
  });

  it('returns "system" for empty string', () => {
    expect(coerceStoredPreference('')).toBe('system');
  });

  it('returns "system" for garbage input', () => {
    expect(coerceStoredPreference('light')).toBe('system');
    expect(coerceStoredPreference('dark')).toBe('system');
    expect(coerceStoredPreference('invalid-theme')).toBe('system');
    expect(coerceStoredPreference('WARM-LIGHT')).toBe('system');
  });
});
