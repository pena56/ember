/**
 * use-duplicates.ts — surface undecided near-duplicate pairs for the Library UI.
 *
 * Mirror of apps/web/src/library/use-duplicates.ts ported to RN + native store.
 * Loads documents + decisions, runs detectDuplicates on canonical docs only,
 * filters to undecided + not session-dismissed pairs, and returns the first pair
 * as `current`. merge/keepSeparate call saveDuplicateDecision then refresh;
 * dismiss is session-only (no record written).
 *
 * Invariant #5: all merge/canonical/dedup logic delegated to @ember/core.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { Document, DuplicateDecision, DuplicatePair } from '@ember/core';
import { detectDuplicates, duplicatePairId, resolveCanonicalId } from '@ember/core';

import { useNativeStore } from '../store/store-context.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DuplicatesState {
  pending: DuplicatePair[];
  current: DuplicatePair | undefined;
  /** The two Document records for `current` — available when current is defined. */
  currentDocs: { a: Document; b: Document } | undefined;
  /** Default canonical: the doc in `current` with the larger byteSize. */
  defaultCanonicalId: string | undefined;
  loading: boolean;
  merge(pair: DuplicatePair, canonicalId: string): Promise<void>;
  keepSeparate(pair: DuplicatePair): Promise<void>;
  dismiss(pair: DuplicatePair): void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useDuplicates(): DuplicatesState {
  const { store, ready } = useNativeStore();
  const [pending, setPending] = useState<DuplicatePair[]>([]);
  const [docMap, setDocMap] = useState<Map<string, Document>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadTick, setLoadTick] = useState(0);

  // Session-dismissed pair ids (not persisted — pairs re-surface on remount)
  const dismissedRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(() => {
    setLoadTick((n) => n + 1);
  }, []);

  useEffect(() => {
    // Guard: wait for the store to be ready (mirrors use-library.ts)
    if (!ready || !store) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [docs, decisions] = await Promise.all([
          store!.listDocuments(),
          store!.listDuplicateDecisions(),
        ]);

        if (cancelled) return;

        // Build a set of decided pair ids
        const decidedIds = new Set<string>(decisions.map((d: DuplicateDecision) => d.id));

        // Only consider canonical docs — an already-merged alias is hidden from the
        // Library, so it must not surface a fresh prompt against a third near-duplicate.
        // (Invariant #5: resolveCanonicalId from @ember/core)
        const canonicals = docs.filter((d) => resolveCanonicalId(decisions, d.id) === d.id);

        // Run the engine's pure duplicate detection (invariant #5: detectDuplicates from @ember/core)
        const allPairs = detectDuplicates(canonicals);

        // Filter to undecided + not session-dismissed
        const undecided = allPairs.filter((pair) => {
          const pairId = duplicatePairId(pair.aId, pair.bId);
          return !decidedIds.has(pairId) && !dismissedRef.current.has(pairId);
        });

        // Build a map for rendering
        const map = new Map<string, Document>(docs.map((d) => [d.id, d]));

        if (!cancelled) {
          setPending(undecided);
          setDocMap(map);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [store, ready, loadTick]);

  const current = pending[0];

  // Derive currentDocs and defaultCanonicalId from `current`
  let currentDocs: { a: Document; b: Document } | undefined;
  let defaultCanonicalId: string | undefined;

  if (current !== undefined) {
    const docA = docMap.get(current.aId);
    const docB = docMap.get(current.bId);
    if (docA !== undefined && docB !== undefined) {
      currentDocs = { a: docA, b: docB };
      // Default canonical = the doc with the larger byteSize (more complete scan)
      defaultCanonicalId = docA.byteSize >= docB.byteSize ? docA.id : docB.id;
    }
  }

  const merge = useCallback(
    async (pair: DuplicatePair, canonicalId: string) => {
      if (!store) return;
      await store.saveDuplicateDecision({
        aId: pair.aId,
        bId: pair.bId,
        canonicalId,
        decision: 'merged',
      });
      refresh();
    },
    [store, refresh],
  );

  const keepSeparate = useCallback(
    async (pair: DuplicatePair) => {
      if (!store) return;
      // canonicalId is irrelevant for 'separate' (resolveCanonicalId ignores it);
      // aId is passed only to satisfy makeDuplicateDecision's ∈{aId,bId} guard.
      await store.saveDuplicateDecision({
        aId: pair.aId,
        bId: pair.bId,
        canonicalId: pair.aId,
        decision: 'separate',
      });
      refresh();
    },
    [store, refresh],
  );

  const dismiss = useCallback((pair: DuplicatePair) => {
    const pairId = duplicatePairId(pair.aId, pair.bId);
    dismissedRef.current.add(pairId);
    // Remove from pending without a full reload (session-only, no record)
    setPending((prev) => prev.filter((p) => duplicatePairId(p.aId, p.bId) !== pairId));
  }, []);

  return {
    pending,
    current,
    currentDocs,
    defaultCanonicalId,
    loading,
    merge,
    keepSeparate,
    dismiss,
  };
}
