import { useCallback, useEffect, useState } from 'react';

import type { Document } from '@ember/core';

import { useWebStore } from '../store/store-context.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type NoticeKind = 'rejected' | 'deduped' | 'added';

export interface Notice {
  kind: NoticeKind;
  message: string;
}

export interface LibraryState {
  documents: Document[];
  loading: boolean;
  notice: Notice | null;
  importFiles: (files: File[]) => Promise<void>;
  dismissNotice: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export function useLibrary(): LibraryState {
  const store = useWebStore();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
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
        setNotice({
          kind: 'rejected',
          message:
            rejected.length === 1
              ? `"${rejected[0]!.name}" is not a PDF, and only PDFs can be added to your library.`
              : `${rejected.length.toString()} files are not PDFs, and only PDFs can be added to your library.`,
        });
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

      // Show a notice for the batch result
      if (rejected.length > 0) {
        setNotice({
          kind: 'rejected',
          message: `${rejected.length.toString()} non-PDF ${rejected.length === 1 ? 'file was' : 'files were'} skipped.`,
        });
      } else if (lastResult?.deduped === true) {
        setNotice({
          kind: 'deduped',
          message: 'Already in your library, no duplicate added.',
        });
      } else if (pdfs.length === 1) {
        const name = pdfs[0]!.name.replace(/\.pdf$/i, '');
        setNotice({
          kind: 'added',
          message: `"${name}" has been added to your library.`,
        });
      } else {
        setNotice({
          kind: 'added',
          message: `${pdfs.length.toString()} PDFs added to your library.`,
        });
      }
    },
    [store, refresh],
  );

  const dismissNotice = useCallback(() => {
    setNotice(null);
  }, []);

  return { documents, loading, notice, importFiles, dismissNotice };
}
