import { useContext } from 'react';

import { ThemeContext } from './theme-provider.js';
import type { ThemeContextValue } from './theme-provider.js';

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
