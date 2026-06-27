import { useEffect, useState } from 'react';

import { useNativeStore } from '../store/store-context.js';

import type { ContinueReadingItem } from './select-continue-reading.js';
import { selectContinueReading } from './select-continue-reading.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ContinueReadingState {
  items: ContinueReadingItem[];
  loading: boolean;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useContinueReading(): ContinueReadingState {
  const { store, ready } = useNativeStore();
  const [items, setItems] = useState<ContinueReadingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready || !store) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [positions, documents, decisions] = await Promise.all([
          store!.listReadingPositions(),
          store!.listDocuments(),
          store!.listDuplicateDecisions(),
        ]);
        if (!cancelled) {
          setItems(selectContinueReading(positions, documents, decisions));
        }
      } catch {
        // Swallow read errors — Today must render even if a read fails (invariant #1)
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
  }, [store, ready]);

  return { items, loading };
}
