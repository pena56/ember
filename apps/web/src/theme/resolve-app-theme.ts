import type { AppThemeName } from '@ember/tokens';

export type ThemePreference = 'system' | AppThemeName;

export function resolveAppTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): AppThemeName {
  if (preference === 'system') {
    return systemPrefersDark ? 'warm-dark' : 'warm-light';
  }
  return preference;
}
