import type { AppThemeName } from '@ember/tokens';

export type ThemePreference = 'system' | AppThemeName;

export const STORAGE_KEY = 'ember-app-theme';

const VALID_PREFERENCES: readonly ThemePreference[] = ['system', 'warm-light', 'warm-dark'];

export function coerceStoredPreference(raw: string | null): ThemePreference {
  if (raw !== null && (VALID_PREFERENCES as readonly string[]).includes(raw)) {
    return raw as ThemePreference;
  }
  return 'system';
}
