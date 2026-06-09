import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { Document } from '@ember/core';

import { useWebStore } from '../store/store-context.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LibraryState {
  documents: Document[];
  loading: boolean;
  importFiles: (files: File[]) => Promise<void>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export function useLibrary(): LibraryState {
  const store = useWebStore();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  // Incrementing this triggers the load effect without calling setState inside it.
  const [loadTick, setLoadTick] = useState(0);

  // Trigger a refresh from event handlers
  const refresh = useCallback(() => {
    setLoadTick((n) => n + 1);
  }, []);

  // Load documents whenever loadTick changes (initial mount + after every import)
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const docs = await store.listDocuments();
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
  }, [store, loadTick]);

  const importFiles = useCallback(
    async (files: File[]) => {
      const pdfs = files.filter(isPdf);
      const rejected = files.filter((f) => !isPdf(f));

      if (rejected.length > 0 && pdfs.length === 0) {
        // All files rejected
        const description =
          rejected.length === 1
            ? `"${rejected[0]!.name}" can't be added. Only PDFs are supported.`
            : `${rejected.length.toString()} files can't be added. Only PDFs are supported.`;
        toast.error("That's not a PDF", { description });
        return;
      }

      let lastResult: { deduped: boolean } | null = null;

      for (const file of pdfs) {
        // Sequential imports — local writes, order matters for the HLC
        const result = await store.importPdf(file);
        lastResult = result;
      }

      // Trigger the load effect
      refresh();

      // Show a toast for the batch result
      if (rejected.length > 0) {
        const description = `${rejected.length.toString()} non-PDF ${rejected.length === 1 ? 'file was' : 'files were'} skipped.`;
        toast.error("That's not a PDF", { description });
      } else if (lastResult?.deduped === true) {
        toast('Already in your library', {
          description: 'This book is already in your collection. No duplicate added.',
        });
      } else if (pdfs.length === 1) {
        const name = pdfs[0]!.name.replace(/\.pdf$/i, '');
        toast.success('Added to your library', {
          description: `"${name}" is ready to read.`,
        });
      } else {
        toast.success('Added to your library', {
          description: `${pdfs.length.toString()} PDFs are ready to read.`,
        });
      }
    },
    [store, refresh],
  );

  return { documents, loading, importFiles };
}
