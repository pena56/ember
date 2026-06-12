/**
 * use-continue-reading.ts — hook: fetch positions + documents in parallel,
 * run the selector, return the sorted list with a loading flag.
 *
 * Mirrors use-library.ts's cancel-flag + loading pattern.
 * Swallows read errors (returns empty) — Today must render offline even if a
 * read fails (architecture invariant #1).
 */

import { useEffect, useState } from 'react';

import { useWebStore } from '../store/store-context.js';

import type { ContinueReadingItem } from './select-continue-reading.js';
import { selectContinueReading } from './select-continue-reading.js';

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface ContinueReadingState {
  items: ContinueReadingItem[];
  loading: boolean;
}

export function useContinueReading(): ContinueReadingState {
  const store = useWebStore();
  const [items, setItems] = useState<ContinueReadingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [positions, documents] = await Promise.all([
          store.listReadingPositions(),
          store.listDocuments(),
        ]);
        if (!cancelled) {
          setItems(selectContinueReading(positions, documents));
        }
      } catch {
        // Swallow read errors — return empty, never crash Today (invariant #1)
        if (!cancelled) {
          setItems([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [store]);

  return { items, loading };
}
