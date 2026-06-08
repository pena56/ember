import { useContext } from 'react';

import type { ThemePreference } from './resolve-app-theme.js';
import { ThemeContext } from './theme-provider.js';

type UseThemeResult = {
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
};

export function useTheme(): UseThemeResult {
  const ctx = useContext(ThemeContext);
  if (ctx === null) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
