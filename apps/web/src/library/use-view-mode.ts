/**
 * use-view-mode.ts — persisted list ⇄ grid preference for the Library.
 *
 * Stored in localStorage so the choice survives reloads and navigation. Reads
 * lazily on first render (SSR-safe guard); writes on every change. Defaults to
 * 'grid' — the cover-forward layout is the more inviting first impression.
 */

import { useEffect, useState } from 'react';

export type ViewMode = 'list' | 'grid';

const STORAGE_KEY = 'ember:library-view';

function readInitial(): ViewMode {
  if (typeof localStorage === 'undefined') return 'grid';
  return localStorage.getItem(STORAGE_KEY) === 'list' ? 'list' : 'grid';
}

export function useViewMode(): readonly [ViewMode, (mode: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(readInitial);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Private-mode / storage-disabled — preference just won't persist.
    }
  }, [mode]);

  return [mode, setMode] as const;
}
