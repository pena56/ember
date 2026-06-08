import Storage from 'expo-sqlite/kv-store';
import React, { createContext, useCallback, useEffect, useState } from 'react';
import { Uniwind } from 'uniwind';

import { coerceStoredPreference, STORAGE_KEY } from './resolve-app-theme.js';
import type { ThemePreference } from './resolve-app-theme.js';

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

function preferenceToUniwindTheme(pref: ThemePreference): 'light' | 'dark' | 'system' {
  if (pref === 'warm-light') return 'light';
  if (pref === 'warm-dark') return 'dark';
  return 'system';
}

type ThemeProviderProps = {
  children: React.ReactNode;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    // Synchronous read to avoid first-frame flash
    const stored = Storage.getItemSync(STORAGE_KEY);
    return coerceStoredPreference(stored);
  });

  useEffect(() => {
    Uniwind.setTheme(preferenceToUniwindTheme(preference));
  }, [preference]);

  const setPreference = useCallback((pref: ThemePreference) => {
    void Storage.setItem(STORAGE_KEY, pref);
    Uniwind.setTheme(preferenceToUniwindTheme(pref));
    setPreferenceState(pref);
  }, []);

  return <ThemeContext.Provider value={{ preference, setPreference }}>{children}</ThemeContext.Provider>;
}
