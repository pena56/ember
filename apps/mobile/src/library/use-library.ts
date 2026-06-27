import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner-native';

import type { BlobStatus, Document } from '@ember/core';
import { resolveCanonicalId } from '@ember/core';

import { useNativeStore, useSyncBundle } from '../store/store-context.js';

import { pickPdf } from './pick-pdf.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Derived sync UI state for a document row. */
export type SyncState =
  | 'synced'        // uploaded and accessible across devices
  | 'pending'       // no status yet — next tick will resolve it
  | 'over-file-cap' // file too large to sync — kept on this device
  | 'over-quota';   // user quota full — kept on this device, retry available

/** Document record extended with its derived sync state. */
export type DocumentWithSync = Document & { syncState: SyncState };

export interface LibraryState {
  documents: DocumentWithSync[];
  loading: boolean;
  pickAndImport(): Promise<void>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function isPdf(mimeType: string | undefined, name: string): boolean {
  return mimeType === 'application/pdf' || name.toLowerCase().endsWith('.pdf');
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
  const { store, ready } = useNativeStore();
  const bundle = useSyncBundle();
  const [documents, setDocuments] = useState<DocumentWithSync[]>([]);
  const [loading, setLoading] = useState(true);
  // Incrementing this triggers the load effect without calling setState inside it.
  const [loadTick, setLoadTick] = useState(0);

  const refresh = useCallback(() => {
    setLoadTick((n) => n + 1);
  }, []);

  // Re-read when the blob-sync scheduler reports a status change. Status records
  // are written without an outbox enqueue (invariant #2), so this local signal is
  // the only wake the library gets — without it a row stays "Syncing…" until remount.
  // No-op when no production bundle exists (injected-store / headless runs).
  useEffect(() => {
    if (bundle === null) return;
    return bundle.blobChange.subscribe(refresh);
  }, [bundle, refresh]);

  // Load documents + blob statuses when the store is ready, and after each import
  useEffect(() => {
    if (!ready || !store) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [docs, statuses, decisions] = await Promise.all([
          store!.listDocuments(),
          store!.listBlobStatuses(),
          store!.listDuplicateDecisions(),
        ]);
        if (!cancelled) {
          // Drop aliases: a doc whose canonical is a different doc is hidden from
          // the library (it folded into its canonical). resolveCanonicalId from @ember/core
          // (invariant #5). The count line in LibraryScreen derives from documents.length
          // so it updates for free.
          const canonicalDocs = docs.filter(
            (doc) => resolveCanonicalId(decisions, doc.id) === doc.id,
          );

          // Build a status map keyed by document id (= contentId in practice)
          const statusMap = new Map<string, BlobStatus>(statuses.map((s) => [s.id, s]));
          const withSync: DocumentWithSync[] = canonicalDocs.map((doc) => ({
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
