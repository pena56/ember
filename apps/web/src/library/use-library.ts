import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { BlobStatus, Document } from '@ember/core';

import { useSyncBundle, useWebStore } from '../store/store-context.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Derived sync UI state for a document row. */
export type SyncState =
  | 'synced'       // uploaded and accessible across devices
  | 'pending'      // no status yet — next tick will resolve it
  | 'over-file-cap' // file too large to sync — kept on this device
  | 'over-quota';  // user quota full — kept on this device, retry available

/** Document record extended with its derived sync state. */
export type DocumentWithSync = Document & { syncState: SyncState };

export interface LibraryState {
  documents: DocumentWithSync[];
  loading: boolean;
  importFiles: (files: File[]) => Promise<void>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function deriveSyncState(status: BlobStatus | undefined): SyncState {
  if (!status) return 'pending';
  if (status.status === 'synced') return 'synced';
  // deferred: branch on code
  if (status.code === 'over-file-cap') return 'over-file-cap';
  if (status.code === 'over-quota') return 'over-quota';
  return 'pending';
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useLibrary(): LibraryState {
  const store = useWebStore();
  const bundle = useSyncBundle();
  const [documents, setDocuments] = useState<DocumentWithSync[]>([]);
  const [loading, setLoading] = useState(false);
  // Incrementing this triggers the load effect without calling setState inside it.
  const [loadTick, setLoadTick] = useState(0);

  // Trigger a refresh from event handlers
  const refresh = useCallback(() => {
    setLoadTick((n) => n + 1);
  }, []);

  // Re-read when the blob-sync scheduler reports a status change. Status records
  // are written without an outbox enqueue (invariant #2), so this local signal is
  // the only wake the library gets — without it a row stays "Syncing…" until the
  // page remounts. No-op when no production bundle exists (injected-store tests).
  useEffect(() => {
    if (bundle === null) return;
    return bundle.blobChange.subscribe(refresh);
  }, [bundle, refresh]);

  // Load documents + blob statuses whenever loadTick changes
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [docs, statuses] = await Promise.all([
          store.listDocuments(),
          store.listBlobStatuses(),
        ]);
        if (!cancelled) {
          // Build a status map keyed by document id (= contentId in practice)
          const statusMap = new Map<string, BlobStatus>(statuses.map((s) => [s.id, s]));
          const withSync: DocumentWithSync[] = docs.map((doc) => ({
            ...doc,
            syncState: deriveSyncState(statusMap.get(doc.id)),
          }));
          setDocuments(withSync);
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
