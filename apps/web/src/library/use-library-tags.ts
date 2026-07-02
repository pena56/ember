/**
 * use-library-tags.ts — extends the library with tag / smart-view data (Unit 15b).
 *
 * Loads tags, doc-tags, smart-views, and reading positions alongside the existing
 * docs/statuses/decisions in a single Promise.all. Derives:
 *   - tagsByDoc: Map<docId, Tag[]> — live tags only (orphan links dropped)
 *   - LibraryEntry[] — built on the canonical doc set
 *   - documents: DocumentWithSync[] — evaluateSmartView output mapped back to docs
 *
 * Invariant #5: the web layer builds LibraryEntry[] and passes it to evaluateSmartView.
 *               It invents NO filter or order logic of its own.
 * Invariant #6: tag colors come from --color-tag-* tokens, not hardcoded here.
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { BlobStatus, DocTag, ReadingPosition, SmartView, SmartViewQuery, Tag } from '@ember/core';
import {
  BUILT_IN_SMART_VIEWS,
  evaluateSmartView,
  resolveCanonicalId,
} from '@ember/core';

import { useSyncBundle, useWebStore } from '../store/store-context.js';

import type { DocumentWithSync, SyncState } from './use-library.js';

export type { SyncState };
export { BUILT_IN_SMART_VIEWS };

// ── Types ─────────────────────────────────────────────────────────────────────

/** Active view state: either a built-in key or a saved SmartView id. */
export type ActiveView =
  | { kind: 'builtin'; key: string; query: SmartViewQuery }
  | { kind: 'saved'; id: string; query: SmartViewQuery };

export interface LibraryTagState {
  /** The evaluator-filtered, ordered doc list. */
  documents: DocumentWithSync[];
  /** Total canonical doc count (before any view filter). */
  totalDocCount: number;
  loading: boolean;

  tags: Tag[];
  docTags: DocTag[];
  /** Live tags per canonical doc (orphan links dropped). */
  tagsByDoc: Map<string, Tag[]>;

  smartViews: SmartView[];
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;

  /** Last-read page per doc (ReadingPosition.id === docId). For progress display. */
  positionsByDoc: Map<string, { page: number }>;

  importFiles: (files: File[]) => Promise<void>;
  refresh: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function deriveSyncState(status: BlobStatus | undefined): SyncState {
  if (!status) return 'pending';
  if (status.status === 'synced') return 'synced';
  if (status.code === 'over-file-cap') return 'over-file-cap';
  if (status.code === 'over-quota') return 'over-quota';
  return 'pending';
}

const DEFAULT_VIEW: ActiveView = {
  kind: 'builtin',
  key: 'all',
  query: BUILT_IN_SMART_VIEWS[0]!.query,
};

// ── Loaded snapshot ───────────────────────────────────────────────────────────

interface LoadedSnapshot {
  allDocs: DocumentWithSync[];
  tags: Tag[];
  docTags: DocTag[];
  smartViews: SmartView[];
  positions: ReadingPosition[];
}

const EMPTY_SNAPSHOT: LoadedSnapshot = {
  allDocs: [],
  tags: [],
  docTags: [],
  smartViews: [],
  positions: [],
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useLibraryTags(): LibraryTagState {
  const store = useWebStore();
  const bundle = useSyncBundle();

  const [snapshot, setSnapshot] = useState<LoadedSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(false);
  const [loadTick, setLoadTick] = useState(0);
  const [activeView, setActiveView] = useState<ActiveView>(DEFAULT_VIEW);

  const refresh = useCallback(() => {
    setLoadTick((n) => n + 1);
  }, []);

  useEffect(() => {
    if (bundle === null) return;
    return bundle.blobChange.subscribe(refresh);
  }, [bundle, refresh]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [docs, statuses, decisions, rawTags, rawDocTags, rawSmartViews, rawPositions] =
          await Promise.all([
            store.listDocuments(),
            store.listBlobStatuses(),
            store.listDuplicateDecisions(),
            store.listTags(),
            store.listDocTags(),
            store.listSmartViews(),
            store.listReadingPositions(),
          ]);

        if (!cancelled) {
          // Drop alias documents (same as use-library.ts:81)
          const canonical = docs.filter(
            (doc) => resolveCanonicalId(decisions, doc.id) === doc.id,
          );

          const statusMap = new Map<string, BlobStatus>(statuses.map((s) => [s.id, s]));
          const allDocs: DocumentWithSync[] = canonical.map((doc) => ({
            ...doc,
            syncState: deriveSyncState(statusMap.get(doc.id)),
          }));

          setSnapshot({ allDocs, tags: rawTags, docTags: rawDocTags, smartViews: rawSmartViews, positions: rawPositions });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [store, loadTick]);

  // ── Derive tagsByDoc (drop orphan links whose tag was deleted) ────────────
  const tagMap = new Map<string, Tag>(snapshot.tags.map((t) => [t.id, t]));
  const tagsByDoc = new Map<string, Tag[]>();
  for (const dt of snapshot.docTags) {
    const tag = tagMap.get(dt.tagId);
    if (tag === undefined) continue; // orphan — tag deleted, goes inert
    const existing = tagsByDoc.get(dt.documentId) ?? [];
    existing.push(tag);
    tagsByDoc.set(dt.documentId, existing);
  }

  // ── Build LibraryEntry[] on the canonical set ─────────────────────────────
  // Omit optional fields when absent (exactOptionalPropertyTypes: true — never set explicit undefined).
  // ReadingPosition.id === documentId (one record per doc)
  const positionMap = new Map<string, { page: number }>(
    snapshot.positions.map((p) => [p.id, { page: p.page }]),
  );

  const docMap = new Map<string, DocumentWithSync>(snapshot.allDocs.map((d) => [d.id, d]));

  const entries = snapshot.allDocs.map((doc) => {
    const tagIds = (tagsByDoc.get(doc.id) ?? []).map((t) => t.id);
    const position = positionMap.get(doc.id);
    // Use spread with conditional fields to satisfy exactOptionalPropertyTypes
    return {
      id: doc.id,
      importedAt: doc.importedAt,
      tagIds,
      ...(doc.pageCount !== undefined ? { pageCount: doc.pageCount } : {}),
      ...(position !== undefined ? { position } : {}),
    };
  });

  // ── Filter via evaluateSmartView (invariant #5 — no bespoke logic) ────────
  const filteredIds = evaluateSmartView(activeView.query, entries);
  const documents = filteredIds
    .map((id) => docMap.get(id))
    .filter((d): d is DocumentWithSync => d !== undefined);

  // ── Import handler ────────────────────────────────────────────────────────
  const importFiles = useCallback(
    async (files: File[]) => {
      const pdfs = files.filter(isPdf);
      const rejected = files.filter((f) => !isPdf(f));

      if (rejected.length > 0 && pdfs.length === 0) {
        const description =
          rejected.length === 1
            ? `"${rejected[0]!.name}" can't be added. Only PDFs are supported.`
            : `${rejected.length.toString()} files can't be added. Only PDFs are supported.`;
        toast.error("That's not a PDF", { description });
        return;
      }

      let lastResult: { deduped: boolean } | null = null;
      for (const file of pdfs) {
        const result = await store.importPdf(file);
        lastResult = result;
      }

      refresh();

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

  return {
    documents,
    totalDocCount: snapshot.allDocs.length,
    loading,
    tags: snapshot.tags,
    docTags: snapshot.docTags,
    tagsByDoc,
    smartViews: snapshot.smartViews,
    activeView,
    setActiveView,
    positionsByDoc: positionMap,
    importFiles,
    refresh,
  };
}
