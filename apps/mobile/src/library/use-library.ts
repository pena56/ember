import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner-native';

import type { Document } from '@ember/core';

import { useNativeStore } from '../store/store-context.js';

import { pickPdf } from './pick-pdf.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LibraryState {
  documents: Document[];
  loading: boolean;
  pickAndImport(): Promise<void>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

function isPdf(mimeType: string | undefined, name: string): boolean {
  return mimeType === 'application/pdf' || name.toLowerCase().endsWith('.pdf');
}

export function useLibrary(): LibraryState {
  const { store, ready } = useNativeStore();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  // Incrementing this triggers the load effect without calling setState inside it.
  const [loadTick, setLoadTick] = useState(0);

  const refresh = useCallback(() => {
    setLoadTick((n) => n + 1);
  }, []);

  // Load documents when the store is ready, and after each import
  useEffect(() => {
    if (!ready || !store) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const docs = await store!.listDocuments();
        if (!cancelled) {
          setDocuments(docs);
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
  }, [store, ready, loadTick]);

  const pickAndImport = useCallback(async () => {
    if (!store) return;

    const picked = await pickPdf();
    if (picked.length === 0) return; // user cancelled

    const valid = picked.filter((p) => isPdf(p.mimeType, p.name));
    const rejected = picked.filter((p) => !isPdf(p.mimeType, p.name));

    // Reject non-PDFs first (fire-and-forget toasts)
    for (const bad of rejected) {
      toast.error("That's not a PDF", {
        description: `"${bad.name}" can't be added — only PDFs are supported.`,
      });
    }

    if (valid.length === 0) return;

    // Sequential imports — local writes; order matters for the HLC. Tally the
    // outcome across the whole batch so a mixed selection (new + duplicate)
    // reports each fairly, not just whichever file happened to land last.
    let added = 0;
    let deduped = 0;
    let lastAddedTitle: string | null = null;
    for (const { bytes, name } of valid) {
      const result = await store.importPdf(bytes, name);
      if (result.deduped) {
        deduped += 1;
      } else {
        added += 1;
        lastAddedTitle = name.replace(/\.pdf$/i, '');
      }
    }

    // Refresh the list
    refresh();

    // One toast per outcome bucket (fire-and-forget)
    if (added > 0) {
      toast.success('Added to your library', {
        description:
          added === 1 && lastAddedTitle !== null
            ? `"${lastAddedTitle}" is ready to read.`
            : `${added.toString()} PDFs are ready to read.`,
      });
    }
    if (deduped > 0) {
      toast('Already in your library', {
        description:
          deduped === 1
            ? 'This book is already in your collection. No duplicate added.'
            : `${deduped.toString()} were already in your collection. No duplicates added.`,
      });
    }
  }, [store, refresh]);

  return { documents, loading, pickAndImport };
}
