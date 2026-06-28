/**
 * use-library-tags.ts — extends the mobile library with tag / smart-view data (Unit 15c).
 *
 * Ports 15b's web use-library-tags.ts to RN. Loads tags, doc-tags, smart-views,
 * and reading positions alongside docs/statuses/decisions in a single Promise.all.
 * Derives:
 *   - tagsByDoc: Map<docId, Tag[]> — live tags only (orphan links dropped)
 *   - LibraryEntry[] — built on the canonical doc set (aliases excluded)
 *   - documents: DocumentWithSync[] — evaluateSmartView output mapped back to docs
 *
 * Invariant #5: the mobile layer builds LibraryEntry[] and passes it to evaluateSmartView.
 *               It invents NO filter or order logic of its own.
 * Invariant #6: tag colors come from --color-tag-* tokens, not hardcoded here.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner-native';

import type { BlobStatus, DocTag, ReadingPosition, SmartView, SmartViewQuery, Tag } from '@ember/core';
import {
  BUILT_IN_SMART_VIEWS,
  evaluateSmartView,
  resolveCanonicalId,
} from '@ember/core';

import { useNativeStore, useSyncBundle } from '../store/store-context.js';

import { pickPdf } from './pick-pdf.js';
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

  pickAndImport(): Promise<void>;
  refresh: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function isPdf(mimeType: string | undefined, name: string): boolean {
  return mimeType === 'application/pdf' || name.toLowerCase().endsWith('.pdf');
}

function deriveSyncState(status: BlobStatus | undefined): SyncState {
  if (!status) return 'pending';
  if (status.status === 'synced') return 'synced';
  if (status.code === 'over-file-cap') return 'over-file-cap';
  if (status.code === 'over-quota') return 'over-quota';
  return 'pending';
}

export const DEFAULT_VIEW: ActiveView = {
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
  const { store, ready } = useNativeStore();
  const bundle = useSyncBundle();

  const [snapshot, setSnapshot] = useState<LoadedSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [loadTick, setLoadTick] = useState(0);
  const [activeView, setActiveView] = useState<ActiveView>(DEFAULT_VIEW);

  const refresh = useCallback(() => {
    setLoadTick((n) => n + 1);
  }, []);

  // Re-read when the blob-sync scheduler reports a status change.
  useEffect(() => {
    if (bundle === null) return;
    return bundle.blobChange.subscribe(refresh);
  }, [bundle, refresh]);

  useEffect(() => {
    if (!ready || !store) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [docs, statuses, decisions, rawTags, rawDocTags, rawSmartViews, rawPositions] =
          await Promise.all([
            store!.listDocuments(),
            store!.listBlobStatuses(),
            store!.listDuplicateDecisions(),
            store!.listTags(),
            store!.listDocTags(),
            store!.listSmartViews(),
            store!.listReadingPositions(),
          ]);

        if (!cancelled) {
          // Drop alias documents (same canonical filter as use-library.ts:86)
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
  }, [store, ready, loadTick]);

  // ── Derive tagsByDoc + filtered list (memoized for stable FlatList identity) ─
  const { tagsByDoc, documents } = useMemo(() => {
    // tagsByDoc — drop orphan links whose tag was deleted (goes inert).
    const tagMap = new Map<string, Tag>(snapshot.tags.map((t) => [t.id, t]));
    const byDoc = new Map<string, Tag[]>();
    for (const dt of snapshot.docTags) {
      const tag = tagMap.get(dt.tagId);
      if (tag === undefined) continue; // orphan — tag deleted
      const existing = byDoc.get(dt.documentId) ?? [];
      existing.push(tag);
      byDoc.set(dt.documentId, existing);
    }

    // Build LibraryEntry[] on the canonical set. Omit optional fields when absent
    // (exactOptionalPropertyTypes: true — never set explicit undefined).
    // ReadingPosition.id === documentId (one record per doc).
    const positionMap = new Map<string, { page: number }>(
      snapshot.positions.map((p) => [p.id, { page: p.page }]),
    );
    const docMap = new Map<string, DocumentWithSync>(snapshot.allDocs.map((d) => [d.id, d]));

    const entries = snapshot.allDocs.map((doc) => {
      const tagIds = (byDoc.get(doc.id) ?? []).map((t) => t.id);
      const position = positionMap.get(doc.id);
      return {
        id: doc.id,
        importedAt: doc.importedAt,
        tagIds,
        ...(doc.pageCount !== undefined ? { pageCount: doc.pageCount } : {}),
        ...(position !== undefined ? { position } : {}),
      };
    });

    // Filter via evaluateSmartView (invariant #5 — no bespoke logic).
    const filteredIds = evaluateSmartView(activeView.query, entries);
    const filtered = filteredIds
      .map((id) => docMap.get(id))
      .filter((d): d is DocumentWithSync => d !== undefined);

    return { tagsByDoc: byDoc, documents: filtered };
  }, [snapshot, activeView]);

  // ── Import handler ────────────────────────────────────────────────────────
  const pickAndImport = useCallback(async () => {
    if (!store) return;

    const picked = await pickPdf();
    if (picked.length === 0) return; // user cancelled

    const valid = picked.filter((p) => isPdf(p.mimeType, p.name));
    const rejected = picked.filter((p) => !isPdf(p.mimeType, p.name));

    for (const bad of rejected) {
      toast.error("That's not a PDF", {
        description: `"${bad.name}" can't be added — only PDFs are supported.`,
      });
    }

    if (valid.length === 0) return;

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

    refresh();

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
    pickAndImport,
    refresh,
  };
}
