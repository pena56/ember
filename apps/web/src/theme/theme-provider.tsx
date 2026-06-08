import { createContext, useCallback, useEffect, useMemo, useState } from 'react';

import type { AppThemeName } from '@ember/tokens';

import { resolveAppTheme } from './resolve-app-theme.js';
import type { ThemePreference } from './resolve-app-theme.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ThemeContextValue {
  preference: ThemePreference;
  resolvedTheme: AppThemeName;
  setPreference: (pref: ThemePreference) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

function readStoredPreference(): ThemePreference {
  const stored = localStorage.getItem('ember-app-theme');
  if (stored === 'warm-light' || stored === 'warm-dark') return stored;
  return 'system';
}

function getSystemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(getSystemPrefersDark);

  // Track system preference via media-query listener
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches);
    };
    mq.addEventListener('change', handler);
    return () => {
      mq.removeEventListener('change', handler);
    };
  }, []);

  const resolvedTheme = useMemo(
    () => resolveAppTheme(preference, systemPrefersDark),
    [preference, systemPrefersDark],
  );

  // Keep data-app-theme on <html> in sync with resolved theme
  useEffect(() => {
    document.documentElement.dataset['appTheme'] = resolvedTheme;
  }, [resolvedTheme]);

  const setPreference = useCallback((pref: ThemePreference) => {
    setPreferenceState(pref);
    if (pref === 'system') {
      localStorage.removeItem('ember-app-theme');
    } else {
      localStorage.setItem('ember-app-theme', pref);
    }
  }, []);

  const value = useMemo(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// ── Internal export for useTheme ──────────────────────────────────────────────

export { ThemeContext };
